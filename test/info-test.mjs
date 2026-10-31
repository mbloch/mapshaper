import assert from 'assert';
import api from '../mapshaper.js';
import { formatTableValue, getElevationInfo, getImageInfo, getLayerInfoRows,
  rasterLooksLikeElevation, rasterLooksLikeImage } from '../src/commands/mapshaper-info';

function makeGrid(values, opts) {
  var o = opts || {};
  return {
    width: o.width || values.length,
    height: o.height || 1,
    bands: 1,
    pixelType: o.pixelType || 'float32',
    samples: Float32Array.from(values),
    sampleBands: [0],
    nodata: 'nodata' in o ? o.nodata : null,
    bbox: o.bbox || [0, 0, values.length, 1],
    transform: [1, 0, 0, 0, -1, 1]
  };
}

describe('mapshaper-info.js', function () {
  describe('elevation rasters', function() {
    it('recognizes single-band numeric rasters', function() {
      assert(rasterLooksLikeElevation({interpretation: 'image', grid: makeGrid([1])}));
      assert(rasterLooksLikeElevation({interpretation: 'image', grid: makeGrid([1], {pixelType: 'int16'})}));
      assert(rasterLooksLikeElevation({interpretation: 'continuous', grid: makeGrid([1], {pixelType: 'uint8'})}));
      assert(!rasterLooksLikeElevation({interpretation: 'image', grid: makeGrid([1], {pixelType: 'uint8'})}));
      assert(!rasterLooksLikeElevation({interpretation: 'categorical', grid: makeGrid([1])}));
      var rgb = makeGrid([1, 2, 3]);
      rgb.bands = 3;
      assert(!rasterLooksLikeElevation({interpretation: 'image', grid: rgb}));
    });

    it('summarizes valid values, ignoring nodata', function() {
      var grid = makeGrid([-9999, 0, 10, 20, 30, 40, -9999, 50], {nodata: -9999});
      var o = getElevationInfo(grid, null);
      assert.equal(o.nodata, -9999);
      assert.equal(o.pixel_count, 8);
      assert.equal(o.nodata_count, 2);
      assert.equal(o.min, 0);
      assert.equal(o.max, 50);
      assert.equal(o.mean, 25);
      assert.equal(o.percentiles[1], 0);
      assert.equal(o.percentiles[50], 30);
      assert.equal(o.percentiles[99], 50);
      assert.strictEqual(o.pixel_size, null);
    });

    it('reports the ground size of pixels in lat-long rasters', function() {
      var grid = makeGrid([1, 2], {width: 2, bbox: [0, -0.5, 2, 0.5]});
      var o = getElevationInfo(grid, api.internal.parseCrsString('wgs84'));
      assert.equal(Math.round(o.pixel_size[0] / 1000), 111);
      assert.equal(Math.round(o.pixel_size[1] / 1000), 111);
    });

    it('handles rasters with no valid pixels', function() {
      var o = getElevationInfo(makeGrid([-1, -1], {nodata: -1}), null);
      assert.strictEqual(o.min, null);
      assert.strictEqual(o.percentiles, null);
    });

    it('formats elevation rows', function() {
      var grid = makeGrid([-9999, 0, 1000, 2000, 3000], {nodata: -9999});
      var rows = getLayerInfoRows({
        raster_type: 'grid', raster_width: 5, raster_height: 1, raster_bands: 1,
        raster_pixel_type: 'float32', bbox: [0, 0, 5, 1], proj4: '',
        elevation: getElevationInfo(grid, null)
      });
      var lookup = Object.fromEntries(rows);
      assert.equal(lookup.Nodata, '-9999 (1 pixel, 20%)');
      assert.equal(lookup.Elevation, '0 to 3,000 (mean 1,500)');
      assert.equal(lookup.Percentiles, '1%: 0 | 25%: 1,000 | 50%: 2,000 | 75%: 2,000 | 99%: 3,000');
    });
  });

  describe('image rasters', function() {
    function makeImage(pixels, bands) {
      var samples = Uint8Array.from([].concat.apply([], pixels));
      return {
        width: pixels.length, height: 1, bands: bands, pixelType: 'uint8',
        samples: samples, nodata: null, bbox: [0, 0, pixels.length, 1]
      };
    }

    it('recognizes 8-bit grayscale, RGB and RGBA images', function() {
      assert(rasterLooksLikeImage({interpretation: 'image', grid: makeImage([[1, 2, 3]], 3)}));
      assert(rasterLooksLikeImage({interpretation: 'image', grid: makeImage([[1, 2, 3, 4]], 4)}));
      assert(rasterLooksLikeImage({interpretation: 'image', grid: makeImage([[1]], 1)}));
      assert(!rasterLooksLikeImage({interpretation: 'continuous', grid: makeImage([[1]], 1)}));
      assert(!rasterLooksLikeImage({interpretation: 'image', grid: makeGrid([1, 2, 3])}));
    });

    it('summarizes OKLCH lightness and chroma, ignoring transparent pixels', function() {
      var o = getImageInfo(makeImage([[0, 0, 0, 255], [255, 255, 255, 255], [255, 0, 0, 0], [119, 119, 119, 128]], 4));
      assert.equal(o.transparent_count, 1);
      assert.equal(o.lightness.min, 0);
      assert.equal(o.lightness.max, 1);
      assert(Math.abs(o.lightness.percentiles[50] - 0.57) < 0.01);
      assert(o.chroma[99] < 0.001);
    });

    it('formats image rows', function() {
      var rows = getLayerInfoRows({
        raster_type: 'grid', raster_width: 3, raster_height: 1, raster_bands: 3,
        raster_pixel_type: 'uint8', bbox: [0, 0, 3, 1], proj4: '',
        image: getImageInfo(makeImage([[0, 0, 0], [255, 0, 0], [255, 255, 255]], 3))
      });
      var lookup = Object.fromEntries(rows);
      assert.equal(lookup.Transparent, undefined);
      assert.equal(lookup.Lightness, '0.00 to 1.00 (mean 0.54, OKLCH 0-1)');
      assert.equal(lookup.Percentiles, '1%: 0.00 | 25%: 0.63 | 50%: 0.63 | 75%: 1.00 | 99%: 1.00');
      assert.equal(lookup.Chroma, 'median 0.000 | 99%: 0.258 (OKLCH; 0 is gray)');
    });
  });

  describe('+ option', function() {
    it('simple table', async function() {
      var data = [{foo: 'bar'}, {foo: 'baz'}];
      var cmd = 'data.json -info + -o format=json';
      var out = await api.applyCommands(cmd, {'data.json': data});
      var d = JSON.parse(out['info.json'])[0];
      assert.equal(d.layer_name, 'data');
      assert.equal(d.feature_count, 2);
    });
  })

  describe('save-to option', function() {

    it('no geometry', async function() {
      var data = [{foo: 'bar'}, {foo: 'baz'}];
      var cmd = '-i data.json -info save-to=info.json';
      var out = await api.applyCommands(cmd, {'data.json': data});
      var info = JSON.parse(out['info.json']);
      assert.deepEqual(info[0].attribute_data, [{field: 'foo', first_value: 'bar'}])
      assert.equal(info[0].layer_name, 'data');
    })

    it('geometry, no attributes', async function() {
      var data = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'Point',
          coordinates: [1, 1]
        }, {
          type: 'Point',
          coordinates: [0, 0]
        }]
      };
      var out = await api.applyCommands('-i points.json -info save-to info', {'points.json': data});
      var info = JSON.parse(out['info.json']);
      assert.strictEqual(info[0].attribute_data, null);
      assert.deepEqual(info[0].bbox, [0, 0, 1, 1]);
    })
  });

  describe('formatTableValue()', function () {

    it('string field', function() {
      var target = "'bar'";
      assert.equal(formatTableValue('bar', 0), target);
    });

    it('decimal field', function() {
      var target = '  -0.4';
      assert.equal(formatTableValue(-0.4, 4), target);
    });

    it('integer field', function() {
      var target = '333';
      assert.equal(formatTableValue(333, 3), target);
    });

    it('object field', function() {
      var target = '{"a":2}';
      assert.equal(formatTableValue({a: 2}, 0), target);
    });

    it('null value', function() {
      var target = 'null';
      assert.equal(formatTableValue(null, 0), target);
    });

    it('undefined value', function() {
      var target = 'undefined';
      assert.equal(formatTableValue(void 0, 0), target);
    });

    it('function', function() {
      var target = '[function]';
      assert.equal(formatTableValue(function() {}, 0), target);
    })

    it('NaN', function() {
      var target = 'NaN';
      assert.equal(formatTableValue(NaN, 0), target);
    })
  })

})