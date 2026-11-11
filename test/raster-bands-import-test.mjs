import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;

// A width x height raster of @bands bands, where band b of pixel i has the
// value (b + 1) * 100 + i
function makeGeoTIFF(o) {
  var width = o.width || 2;
  var height = o.height || 2;
  var bands = o.bands;
  var Arr = o.pixelType == 'uint8' ? Uint8Array : Int16Array;
  var samples = new Arr(width * height * bands);
  for (var i = 0; i < width * height; i++) {
    for (var b = 0; b < bands; b++) {
      samples[i * bands + b] = o.pixelType == 'uint8' ? b * 10 + i : (b + 1) * 100 + i;
    }
  }
  var grid = {
    width: width, height: height, bands: bands,
    pixelType: o.pixelType || 'int16',
    samples: samples, nodata: null,
    bbox: [0, 0, width, height],
    transform: [1, 0, 0, 0, -1, height]
  };
  if (o.displayBands) grid.displayBands = o.displayBands;
  return Buffer.from(internal.encodeGeoTIFF(grid, {
    geoKeys: {GTModelTypeGeoKey: 2, GeographicTypeGeoKey: 4326},
    gdalMetadata: o.metadata || null
  }));
}

function description(band, value) {
  return {band: band, name: 'DESCRIPTION', role: 'description', value: value};
}

async function importRaster(content, opts) {
  var dataset = await internal.importFileAsync('in.tif', Object.assign({
    input: {'in.tif': content}
  }, opts));
  return dataset.layers[0].raster;
}

var GRAY = {color: [0], alpha: -1};

describe('Importing the bands of a raster', function () {

  describe('data rasters', function () {
    it('imports every band of a 16-bit raster, displaying the first in gray', async function () {
      var raster = await importRaster(makeGeoTIFF({bands: 3, displayBands: GRAY}), {});
      var grid = raster.grid;
      assert.equal(grid.bands, 3);
      assert.deepEqual(grid.sampleBands, [0, 1, 2]);
      assert.deepEqual(grid.displayBands, GRAY);
      assert.deepEqual(Array.from(grid.samples.slice(0, 3)), [100, 200, 300]);
      assert.equal(raster.derivation.type, 'gray');
      assert.equal(raster.view.recipe.type, 'gray');
    });

    it('imports every band of an 8-bit raster imported as data', async function () {
      var content = makeGeoTIFF({bands: 3, pixelType: 'uint8'});
      var image = await importRaster(content, {});
      var data = await importRaster(content, {interpretation: 'continuous'});
      assert.equal(image.grid.bands, 3);
      assert.strictEqual(image.grid.displayBands, undefined);
      assert.equal(image.view.recipe.type, 'rgb');
      assert.equal(data.grid.bands, 3);
      assert.deepEqual(data.grid.displayBands, GRAY);
      assert.equal(data.view.recipe.type, 'gray');
    });

    it('raster-type=image imports only the displayed bands', async function () {
      var raster = await importRaster(makeGeoTIFF({bands: 4, displayBands: GRAY}),
        {interpretation: 'image'});
      assert.equal(raster.grid.bands, 3);
      assert.deepEqual(raster.grid.sampleBands, [0, 1, 2]);
      assert.strictEqual(raster.grid.displayBands, undefined);
    });

    it('a single-band raster has no displayBands', async function () {
      var raster = await importRaster(makeGeoTIFF({bands: 1}), {});
      assert.equal(raster.grid.bands, 1);
      assert.strictEqual(raster.grid.displayBands, undefined);
    });

    it('a data raster with displayBands is not an image that -tone can adjust', async function () {
      var content = makeGeoTIFF({bands: 3, pixelType: 'uint8'});
      await assert.rejects(api.applyCommands('-i in.tif raster-type=continuous -tone lightness=1.2',
        {'in.tif': content}));
      await api.applyCommands('-i in.tif -tone lightness=1.2', {'in.tif': content});
    });
  });

  describe('bands=', function () {
    var content = makeGeoTIFF({bands: 4, displayBands: GRAY});

    it('imports the listed bands, keeping their file band numbers', async function () {
      var raster = await importRaster(content, {bands: '1,3'});
      assert.equal(raster.grid.bands, 2);
      assert.deepEqual(raster.grid.sampleBands, [0, 2]);
      assert.deepEqual(Array.from(raster.grid.samples.slice(0, 4)), [100, 300, 101, 301]);
    });

    it('sorts the list and removes duplicates', async function () {
      var raster = await importRaster(content, {bands: '4,2,4'});
      assert.deepEqual(raster.grid.sampleBands, [1, 3]);
    });

    it('a band other than band 1 is read by its file number', async function () {
      var raster = await importRaster(content, {bands: '3'});
      assert.equal(raster.grid.bands, 1);
      assert.deepEqual(raster.grid.sampleBands, [2]);
      assert.equal(raster.grid.samples[0], 300);
      assert.equal(internal.getRasterGridBandIndex(raster.grid, 3), 0);
    });

    it('bands=all imports every band of an image', async function () {
      var rgb = makeGeoTIFF({bands: 5, pixelType: 'uint8'});
      var raster = await importRaster(rgb, {bands: 'all'});
      assert.equal(raster.grid.bands, 5);
      assert.strictEqual(raster.grid.displayBands, undefined);
      assert.equal(raster.view.recipe.type, 'rgb');
    });

    it('an image missing some of its color bands is displayed in gray', async function () {
      var rgb = makeGeoTIFF({bands: 3, pixelType: 'uint8'});
      var raster = await importRaster(rgb, {bands: '2,3'});
      assert.deepEqual(raster.grid.sampleBands, [1, 2]);
      assert.equal(raster.view.recipe.type, 'gray');
    });

    it('rejects band numbers that are missing or invalid', async function () {
      await assert.rejects(importRaster(content, {bands: '5'}), /does not have band 5 \(it has 4 bands\)/);
      await assert.rejects(importRaster(content, {bands: '0'}), /Invalid bands=/);
      await assert.rejects(importRaster(content, {bands: '1,x'}), /Invalid bands=/);
      await assert.rejects(importRaster(content, {bands: '1.5'}), /Invalid bands=/);
    });

    it('is parsed from the -i command', async function () {
      var out = await api.applyCommands('-i in.tif bands=2,4 -info save-to=info',
        {'in.tif': content});
      var info = JSON.parse(out['info.json'])[0];
      assert.equal(info.raster_bands, 2);
    });
  });

  describe('import size limit', function () {
    var opts = {raster_max_pixels: 10000};

    it('is shared by more than four bands', async function () {
      var four = await importRaster(makeGeoTIFF({bands: 4, width: 100, height: 100, displayBands: GRAY}), opts);
      var eight = await importRaster(makeGeoTIFF({bands: 8, width: 100, height: 100, displayBands: GRAY}), opts);
      assert.equal(four.grid.width, 100);
      assert.equal(eight.grid.bands, 8);
      assert.equal(eight.grid.width, 71);
    });

    it('bands= imports fewer bands at a higher resolution', async function () {
      var raster = await importRaster(makeGeoTIFF({bands: 8, width: 100, height: 100, displayBands: GRAY}),
        Object.assign({bands: '1,2'}, opts));
      assert.equal(raster.grid.width, 100);
    });
  });

  describe('band descriptions', function () {
    var content = makeGeoTIFF({bands: 3, displayBands: GRAY,
      metadata: [description(0, 'Red & <visible>'), description(2, 'NIR')]});

    it('are read from GDAL metadata, by file band number', async function () {
      var raster = await importRaster(content, {});
      assert.deepEqual(raster.grid.bandDescriptions, {1: 'Red & <visible>', 3: 'NIR'});
    });

    it('are read for the imported bands only', async function () {
      var raster = await importRaster(content, {bands: '2,3'});
      assert.deepEqual(raster.grid.bandDescriptions, {3: 'NIR'});
    });

    it('are read from an .aux.xml sidecar', async function () {
      var aux = '<PAMDataset>\n<PAMRasterBand band="2"><Description>Green</Description></PAMRasterBand>\n</PAMDataset>';
      var dataset = await internal.importFileAsync('in.tif', {
        input: {'in.tif': content, 'in.tif.aux.xml': aux}
      });
      assert.deepEqual(dataset.layers[0].raster.grid.bandDescriptions,
        {1: 'Red & <visible>', 2: 'Green', 3: 'NIR'});
    });

    it('are listed by -info', async function () {
      var out = await api.applyCommands('-i in.tif bands=1,2 -info save-to=info',
        {'in.tif': content});
      var info = JSON.parse(out['info.json'])[0];
      assert.deepEqual(info.raster_band_list, [
        {band: 1, description: 'Red & <visible>'},
        {band: 2, description: null}
      ]);
    });

    it('-info lists no bands for a raster of all its bands, without descriptions', async function () {
      var out = await api.applyCommands('-i in.tif -info save-to=info',
        {'in.tif': makeGeoTIFF({bands: 3, displayBands: GRAY})});
      assert.strictEqual(JSON.parse(out['info.json'])[0].raster_band_list, null);
    });
  });

  describe('commands keep the imported bands', function () {
    var content = makeGeoTIFF({bands: 4, width: 20, height: 20, displayBands: GRAY,
      metadata: [description(1, 'Slope')]});

    ['-clip bbox=2,2,15,15', '-proj merc', '-proj merc -blur radius=1px'].forEach(function(cmd) {
      it(cmd, async function () {
        var catalog = new internal.Catalog();
        var grid;
        catalog.addDataset(await internal.importFileAsync('in.tif',
          {input: {'in.tif': content}, bands: '2,3,4'}));
        await internal.runParsedCommands(internal.parseCommands(cmd), new internal.Job(catalog));
        grid = catalog.getActiveLayer().layer.raster.grid;
        assert.equal(grid.bands, 3);
        assert.deepEqual(grid.sampleBands, [1, 2, 3]);
        assert.deepEqual(grid.displayBands, GRAY);
        assert.deepEqual(grid.bandDescriptions, {2: 'Slope'});
      });
    });
  });
});
