import api from '../mapshaper.js';
import assert from 'assert';
import {
  getVerticalUnitMeters,
  getVerticalUnitsFromMeters,
  parseVerticalUnits
} from '../src/rasters/mapshaper-vertical-units';

var internal = api.internal;

// A 2x2 DEM in UTM, with optional band metadata and geo keys
function makeDem(samples, opts) {
  var o = opts || {};
  var bbox = [500000, 4000000, 500200, 4000200];
  var grid = {
    width: 2,
    height: 2,
    bands: 1,
    samples: samples,
    nodata: 'nodata' in o ? o.nodata : null,
    bbox: bbox,
    transform: [100, 0, bbox[0], 0, -100, bbox[3]]
  };
  return Buffer.from(internal.encodeGeoTIFF(grid, {
    geoKeys: Object.assign({GTModelTypeGeoKey: 1, ProjectedCSTypeGeoKey: 32610}, o.geoKeys),
    gdalMetadata: o.metadata || null
  }));
}

function unitType(value) {
  return {band: 0, name: 'UNITTYPE', role: 'unittype', value: value};
}

async function importDem(content, files) {
  return internal.importFileAsync('dem.tif', {
    input: Object.assign({'dem.tif': content}, files)
  });
}

function getGrid(dataset) {
  return dataset.layers[0].raster.grid;
}

describe('raster vertical units', function () {

  describe('unit names', function () {
    it('parseVerticalUnits() reads the ways GDAL and people write units', function () {
      assert.equal(parseVerticalUnits('m'), 'm');
      assert.equal(parseVerticalUnits('metre'), 'm');
      assert.equal(parseVerticalUnits('Meters'), 'm');
      assert.equal(parseVerticalUnits('ft'), 'ft');
      assert.equal(parseVerticalUnits('foot'), 'ft');
      assert.equal(parseVerticalUnits('US survey foot'), 'us-ft');
      assert.equal(parseVerticalUnits('ftUS'), 'us-ft');
      assert.equal(parseVerticalUnits(' '), null);
      assert.equal(parseVerticalUnits(null), null);
      // unrecognized units are kept, so they can be reported
      assert.equal(parseVerticalUnits('fathoms'), 'fathoms');
      assert.equal(getVerticalUnitMeters('fathoms'), null);
    });

    it('getVerticalUnitsFromMeters() finds the unit of a conversion factor', function () {
      assert.equal(getVerticalUnitsFromMeters(1), 'm');
      assert.equal(getVerticalUnitsFromMeters(0.3048), 'ft');
      assert.equal(getVerticalUnitsFromMeters(0.3048006096), 'us-ft');
      assert.equal(getVerticalUnitsFromMeters(0.5), null);
    });
  });

  describe('parseAuxBandInfo()', function () {
    it('reads the units, scale and offset of a band', function () {
      var xml = '<PAMDataset>\n<PAMRasterBand band="1">\n<UnitType>ft</UnitType>\n' +
        '<Offset>5</Offset>\n<Scale>0.1</Scale>\n</PAMRasterBand>\n</PAMDataset>';
      assert.deepEqual(internal.parseAuxBandInfo(xml, 0), {units: 'ft', scale: 0.1, offset: 5});
      assert.deepEqual(internal.parseAuxBandInfo(xml, 1), {units: null, scale: null, offset: null});
    });
  });

  describe('GeoTIFF import', function () {
    it('reads UNITTYPE from GDAL\'s metadata tag', async function () {
      var dataset = await importDem(makeDem(new Float32Array([1, 2, 3, 4]), {
        metadata: [unitType('ft')]
      }));
      assert.equal(getGrid(dataset).verticalUnits, 'ft');
    });

    it('reads the units of a vertical CRS from the geo keys', async function () {
      // NAVD88 height (ftUS)
      var dataset = await importDem(makeDem(new Float32Array([1, 2, 3, 4]), {
        geoKeys: {VerticalCSTypeGeoKey: 6360}
      }));
      assert.equal(getGrid(dataset).verticalUnits, 'us-ft');
    });

    it('reads VerticalUnitsGeoKey', async function () {
      var dataset = await importDem(makeDem(new Float32Array([1, 2, 3, 4]), {
        geoKeys: {VerticalUnitsGeoKey: 9002}
      }));
      assert.equal(getGrid(dataset).verticalUnits, 'ft');
    });

    it('prefers UNITTYPE to the geo keys', async function () {
      var dataset = await importDem(makeDem(new Float32Array([1, 2, 3, 4]), {
        geoKeys: {VerticalCSTypeGeoKey: 6360},
        metadata: [unitType('m')]
      }));
      assert.equal(getGrid(dataset).verticalUnits, 'm');
    });

    it('leaves the units of a DEM without metadata unset', async function () {
      var dataset = await importDem(makeDem(new Float32Array([1, 2, 3, 4])));
      assert.equal(getGrid(dataset).verticalUnits, undefined);
    });

    it('applies SCALE and OFFSET, including to the nodata value', async function () {
      var dataset = await importDem(makeDem(new Int16Array([0, 100, 200, 300]), {
        nodata: 0,
        metadata: [
          {band: 0, name: 'OFFSET', role: 'offset', value: 5},
          {band: 0, name: 'SCALE', role: 'scale', value: 0.1}
        ]
      }));
      var grid = getGrid(dataset);
      assert.equal(grid.pixelType, 'float32');
      assert.deepEqual(Array.from(grid.samples), [5, 15, 25, 35]);
      assert.equal(grid.nodata, 5);
      assert.equal(internal.rasterPixelIsNodata(grid, 0), true);
      assert.equal(internal.rasterPixelIsNodata(grid, 1), false);
    });

    it('a .aux.xml sidecar overrides the band metadata in the file', async function () {
      var aux = '<PAMDataset><PAMRasterBand band="1"><UnitType>ft</UnitType>' +
        '<Scale>2</Scale></PAMRasterBand></PAMDataset>';
      var dataset = await importDem(makeDem(new Int16Array([1, 2, 3, 4]), {
        metadata: [unitType('m')]
      }), {'dem.tif.aux.xml': aux});
      var grid = getGrid(dataset);
      assert.equal(grid.verticalUnits, 'ft');
      assert.deepEqual(Array.from(grid.samples), [2, 4, 6, 8]);
    });
  });

  describe('GeoTIFF export', function () {
    it('writes the units as UNITTYPE, which survive a round trip', async function () {
      var out = await api.applyCommands('-i dem.tif -o out.tif', {'dem.tif': makeDem(
        new Float32Array([1, 2, 3, 4]), {geoKeys: {VerticalCSTypeGeoKey: 6360}})});
      var bytes = Buffer.from(out['out.tif']);
      var reimported = await importDem(bytes);
      assert.equal(getGrid(reimported).verticalUnits, 'us-ft');
      assert(bytes.toString('latin1').includes(
        '<Item name="UNITTYPE" sample="0" role="unittype">US survey foot</Item>'));
    });
  });

  describe('import options', function () {
    var PLAIN_TIFF = 'test/data/geotiff/no-georef-gray-3x2.tif';

    it('vertical-units= assigns or overrides the units of the values', async function () {
      var dataset = await internal.importFileAsync('dem.tif', {
        vertical_units: 'feet',
        input: {'dem.tif': makeDem(new Float32Array([1, 2, 3, 4]), {metadata: [unitType('m')]})}
      });
      assert.equal(getGrid(dataset).verticalUnits, 'ft');
    });

    it('vertical-units= rejects units it can\'t convert', async function () {
      await assert.rejects(internal.importFileAsync('dem.tif', {
        vertical_units: 'fathoms',
        input: {'dem.tif': makeDem(new Float32Array([1, 2, 3, 4]))}
      }), /Unsupported vertical-units/);
    });

    it('pixel-size= gives the ground size of a pixel in pixel coordinates', async function () {
      var out = await api.applyCommands('-i ' + PLAIN_TIFF + ' pixel-size=100ft -info save-to=info.json');
      assert.deepEqual(JSON.parse(out['info.json'])[0].elevation.pixel_size, [30.48, 30.48]);
    });

    it('pixel-size= is rejected for a raster with a CRS', async function () {
      await assert.rejects(internal.importFileAsync('dem.tif', {
        pixel_size: '30m',
        input: {'dem.tif': makeDem(new Float32Array([1, 2, 3, 4]))}
      }), /pixel-size= is for rasters without a coordinate system/);
    });

    it('a raster in pixel coordinates is not taken for lat-long', async function () {
      // 3x2 pixels, well inside the lat-long range
      var dataset = await internal.importFileAsync(PLAIN_TIFF, {});
      assert.equal(internal.getDatasetCRS(dataset), null);
    });
  });

  describe('-info', function () {
    it('shows the units of an elevation raster', async function () {
      var out = await api.applyCommands('-i dem.tif -info save-to=info.json', {
        'dem.tif': makeDem(new Float32Array([1, 2, 3, 4]), {metadata: [unitType('ft')]})
      });
      assert.equal(JSON.parse(out['info.json'])[0].elevation.units, 'ft');
    });
  });
});
