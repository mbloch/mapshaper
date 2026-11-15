import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;

function square(x0, y0, x1, y1) {
  return [[x0, y0], [x0, y1], [x1, y1], [x1, y0], [x0, y0]];
}

function importPolygons(coordinates, name) {
  var dataset = internal.importGeoJSON({
    type: 'FeatureCollection',
    features: coordinates.map(function(coords) {
      return {type: 'Feature', properties: null, geometry: {type: 'Polygon', coordinates: coords}};
    })
  }, {});
  dataset.layers[0].name = name || 'shape';
  dataset.info.crs_string = 'wgs84';
  return dataset;
}

// A dataset containing one raster layer named "raster", with a 1-unit cell
function makeRasterDataset(width, height, bands, samples, props) {
  return {
    info: {crs_string: 'wgs84'},
    layers: [{
      name: 'raster',
      raster_type: 'grid',
      raster: Object.assign({
        sourceId: 'raster',
        interpretation: 'image',
        grid: {
          width: width,
          height: height,
          bands: bands,
          pixelType: samples instanceof Float32Array ? 'float32' : 'uint8',
          samples: samples,
          sampleBands: bands == 1 ? [0] : [0, 1, 2],
          nodata: null,
          bbox: [0, 0, width, height],
          transform: [1, 0, 0, 0, -1, height]
        },
        view: {recipe: {type: bands == 1 ? 'gray' : 'rgb', bands: bands == 1 ? [0] : [0, 1, 2]}}
      }, props)
    }]
  };
}

function getMask(grid, coordinates) {
  var dataset = importPolygons(coordinates);
  return Array.from(internal.getPolygonPixelMask(grid, dataset.layers[0], dataset.arcs));
}

async function run(datasets, commands) {
  var catalog = new internal.Catalog();
  datasets.forEach(function(dataset) { catalog.addDataset(dataset); });
  await internal.runParsedCommands(internal.parseCommands(commands), new internal.Job(catalog));
  return catalog;
}

function findLayer(catalog, name) {
  return catalog.getLayers().find(function(o) { return o.layer.name == name; }).layer;
}

// Covers the middle 2x2 pixels of a 4x4 raster, and the top-left pixel. The
// clipped raster is cropped to the 3x3 pixels in the shapes' bounding box.
var CLIP_SHAPES = [[square(1, 1, 3, 3)], [square(0, 3, 1, 4)]];
var INSIDE = [
  1, 0, 0,
  0, 1, 1,
  0, 1, 1
];

describe('raster clipping', function () {

  describe('getPolygonPixelMask()', function () {
    var grid = {width: 6, height: 6, bbox: [0, 0, 6, 6]};

    it('excludes holes', function () {
      assert.deepEqual(getMask(grid, [[square(1, 1, 5, 5), square(2, 2, 4, 4)]]), [
        0, 0, 0, 0, 0, 0,
        0, 1, 1, 1, 1, 0,
        0, 1, 0, 0, 1, 0,
        0, 1, 0, 0, 1, 0,
        0, 1, 1, 1, 1, 0,
        0, 0, 0, 0, 0, 0
      ]);
    });

    it('includes the overlap of two features', function () {
      assert.deepEqual(getMask(grid, [[square(0, 2, 4, 4)], [square(2, 2, 6, 4)]]), [
        0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0,
        1, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 1,
        0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0
      ]);
    });

    it('keeps a pixel whose center is on the left or top edge, but not the right or bottom edge', function () {
      // pixel centers are at 0.5, 1.5, ...
      assert.deepEqual(getMask({width: 4, height: 2, bbox: [0, 0, 4, 2]}, [[square(0.5, 0.5, 2.5, 1.5)]]), [
        1, 1, 0, 0,
        0, 0, 0, 0
      ]);
    });

    it('tests pixel centers against diagonal edges', function () {
      var triangle = [[0, 0], [0, 4.2], [4.2, 0], [0, 0]];
      assert.deepEqual(getMask({width: 4, height: 4, bbox: [0, 0, 4, 4]}, [[triangle]]), [
        1, 0, 0, 0,
        1, 1, 0, 0,
        1, 1, 1, 0,
        1, 1, 1, 1
      ]);
    });
  });

  describe('findUnusedSampleValue()', function () {
    it('prefers -9999 for float data', function () {
      assert.equal(internal.findUnusedSampleValue({samples: new Float32Array([1, 2])}), -9999);
      assert.equal(internal.findUnusedSampleValue({samples: new Float32Array([-9999, 2])}), -3.4028234663852886e38);
    });

    it('uses the end of the type\'s range for integer data', function () {
      assert.equal(internal.findUnusedSampleValue({samples: new Int16Array([5, 6])}), -32768);
      assert.equal(internal.findUnusedSampleValue({samples: new Int16Array([-32768, 6])}), 32767);
      assert.equal(internal.findUnusedSampleValue({samples: new Uint8Array([0, 6])}), 255);
      assert.equal(internal.findUnusedSampleValue({samples: new Uint8Array([6, 255])}), 0);
    });

    it('finds a gap in 8-bit data that uses both ends of the range', function () {
      var samples = new Uint8Array(256);
      for (var i = 0; i < 256; i++) samples[i] = i == 7 ? 0 : i;
      assert.equal(internal.findUnusedSampleValue({samples: samples}), 7);
      samples[7] = 7;
      assert.strictEqual(internal.findUnusedSampleValue({samples: samples}), null);
    });
  });

  describe('-clip with a polygon layer', function () {
    function clip(dataset, opts) {
      return run([dataset, importPolygons(CLIP_SHAPES)], '-clip shape target=raster ' + (opts || ''))
        .then(function(catalog) { return findLayer(catalog, 'raster').raster; });
    }

    it('adds an alpha band to an RGB image, making removed pixels transparent', async function () {
      var samples = new Uint8Array(48).fill(100);
      var raster = await clip(makeRasterDataset(4, 4, 3, samples));
      var grid = raster.grid;
      assert.deepEqual([grid.width, grid.height, grid.bands], [3, 3, 4]);
      assert.deepEqual(grid.bbox, [0, 1, 3, 4]);
      assert.deepEqual(grid.sampleBands, [0, 1, 2, 3]);
      assert.deepEqual(raster.view.recipe.bands, [0, 1, 2, 3]);
      INSIDE.forEach(function(inside, i) {
        var pixel = Array.from(grid.samples.subarray(i * 4, i * 4 + 4));
        assert.deepEqual(pixel, inside ? [100, 100, 100, 255] : [0, 0, 0, 0]);
      });
      assert.deepEqual(Array.from(grid.coverage), INSIDE);
    });

    it('turns a one-band image into RGBA', async function () {
      var samples = new Uint8Array(16).fill(80);
      var raster = await clip(makeRasterDataset(4, 4, 1, samples));
      assert.equal(raster.grid.bands, 4);
      assert.equal(raster.view.recipe.type, 'rgb');
      assert.deepEqual(Array.from(raster.grid.samples.subarray(0, 8)), [80, 80, 80, 255, 0, 0, 0, 0]);
    });

    it('fills removed pixels of a data raster with its nodata value', async function () {
      var samples = new Float32Array(16).fill(1200.5);
      var dataset = makeRasterDataset(4, 4, 1, samples, {interpretation: 'continuous'});
      dataset.layers[0].raster.grid.nodata = -32768;
      var grid = (await clip(dataset)).grid;
      assert.equal(grid.bands, 1);
      assert.equal(grid.nodata, -32768);
      assert.deepEqual(Array.from(grid.samples), INSIDE.map(function(inside) {
        return inside ? 1200.5 : -32768;
      }));
    });

    it('gives a data raster without a nodata value one that its data does not use', async function () {
      var samples = new Float32Array(16).fill(1200.5);
      var grid = (await clip(makeRasterDataset(4, 4, 1, samples, {interpretation: 'continuous'}))).grid;
      assert.equal(grid.nodata, -9999);
      assert.equal(grid.samples[1], -9999);
      assert.equal(grid.samples[0], 1200.5);
    });

    it('paints removed pixels with nodata-color=', async function () {
      var samples = new Uint8Array(48).fill(100);
      var grid = (await clip(makeRasterDataset(4, 4, 3, samples), 'nodata-color=red')).grid;
      assert.equal(grid.bands, 3);
      assert.deepEqual(Array.from(grid.samples.subarray(0, 6)), [100, 100, 100, 255, 0, 0]);
    });

    it('crops to the polygons\' bounding box', async function () {
      var samples = new Uint8Array(48).fill(100);
      var dataset = importPolygons([[square(1, 1, 3, 3)]]);
      var catalog = await run([makeRasterDataset(4, 4, 3, samples), dataset], '-clip shape target=raster');
      var grid = findLayer(catalog, 'raster').raster.grid;
      // the polygon covers whole pixels, so none need to be made transparent
      assert.deepEqual([grid.width, grid.height, grid.bands], [2, 2, 3]);
      assert.deepEqual(grid.bbox, [1, 1, 3, 3]);
    });

    it('keeps the pixels whose centers are inside a bbox= rectangle', async function () {
      var samples = new Uint8Array(48).fill(100);
      var catalog = await run([makeRasterDataset(4, 4, 3, samples)], '-clip bbox=0.6,0.6,2.4,2.4 target=raster');
      var grid = findLayer(catalog, 'raster').raster.grid;
      assert.deepEqual([grid.width, grid.height, grid.bands], [1, 1, 3]);
      assert.deepEqual(grid.bbox, [1, 1, 2, 2]);
    });
  });

  it('clipRasterToBBox() keeps the pixel size when the rectangle splits pixels', function () {
    var lyr = makeRasterDataset(4, 1, 1, new Uint8Array([1, 2, 3, 4])).layers[0];
    internal.clipRasterToBBox(lyr, [0.5, 0, 2.5, 1], {});
    var grid = lyr.raster.grid;
    assert.deepEqual(Array.from(grid.samples), [1, 2, 3]);
    assert.deepEqual(grid.bbox, [0, 0, 3, 1]);
    assert.deepEqual(grid.transform, [1, 0, 0, 0, -1, 1]);
  });
});
