import api from '../mapshaper.js';
import assert from 'assert';
import { PNG } from 'pngjs';

var internal = api.internal;

// A one-row grid of @values (more bands: @values holds each pixel's bands)
function makeGrid(values, o) {
  o = o || {};
  var bands = o.bands || 1;
  var width = o.width || values.length / bands;
  var height = o.height || 1;
  return Object.assign({
    width: width,
    height: height,
    bands: bands,
    pixelType: o.pixelType || 'float32',
    samples: (o.pixelType == 'int16' ? Int16Array : Float32Array).from(values),
    nodata: null,
    bbox: [0, 0, width, height],
    transform: [1, 0, 0, 0, -1, height]
  }, o.grid);
}

function render(grid, palette) {
  return internal.renderRasterPreview(grid, {palette: palette}, grid.width, grid.height);
}

// [[r, g, b, a], ...] for each pixel
function getColors(preview) {
  var out = [];
  for (var i = 0; i < preview.pixels.length; i += 4) {
    out.push(Array.from(preview.pixels.slice(i, i + 4)));
  }
  return out;
}

function rgba(color) {
  var o = api.internal.parseColor(color);
  return [Math.round(o.r), Math.round(o.g), Math.round(o.b), Math.round(o.a * 255)];
}

var RED = [255, 0, 0, 255], GREEN = [0, 128, 0, 255], BLUE = [0, 0, 255, 255];
var CLEAR = [0, 0, 0, 0];

describe('raster palettes', function () {

  describe('continuous colors', function () {
    it('interpolate between the colors at the breaks, clamping outside them', function () {
      var grid = makeGrid([-10, 0, 50, 100, 200]);
      var colors = getColors(render(grid, {
        type: 'sequential', continuous: true, breaks: [0, 100],
        colors: ['#000000', '#ffffff'], interpolation: 'rgb'
      }));
      assert.deepEqual(colors[0], [0, 0, 0, 255]);
      assert.deepEqual(colors[1], [0, 0, 0, 255]);
      assert(Math.abs(colors[2][0] - 128) <= 1);
      assert.deepEqual(colors[3], [255, 255, 255, 255]);
      assert.deepEqual(colors[4], [255, 255, 255, 255]);
    });

    it('match the colors of -classify continuous on a vector layer', function () {
      var values = [0, 13, 37, 50, 81, 100];
      var palette = {type: 'sequential', continuous: true, breaks: [0, 50, 100],
        colors: ['#2b5c3f', '#c9b98a', '#f4efe6']};
      var colors = getColors(render(makeGrid(values), palette));
      var records = values.map(function(v) { return {v: v}; });
      var lyr = {geometry_type: null, data: new internal.DataTable(records)};
      api.cmd.classify(lyr, {layers: [lyr]}, {field: 'v', colors: palette.colors,
        breaks: [50], continuous: true});
      lyr.data.getRecords().forEach(function(rec, i) {
        var expected = rgba(rec.fill);
        colors[i].forEach(function(c, j) {
          assert(Math.abs(c - expected[j]) <= 2, 'pixel ' + i + ': ' + colors[i] + ' vs ' + expected);
        });
      });
    });

    it('oklch (the default) and rgb interpolation give different midpoints', function () {
      var grid = makeGrid([50]);
      var palette = {type: 'sequential', continuous: true, breaks: [0, 100], colors: ['blue', 'yellow']};
      var oklch = getColors(render(grid, palette))[0];
      var rgb = getColors(render(grid, Object.assign({}, palette, {interpolation: 'rgb'})))[0];
      assert.notDeepEqual(oklch, rgb);
    });
  });

  describe('classes', function () {
    it('put a value equal to a break in the class above it, as -classify does', function () {
      var colors = getColors(render(makeGrid([5, 10, 15, 20, 25]), {
        type: 'sequential', breaks: [10, 20], colors: ['red', 'green', 'blue']
      }));
      assert.deepEqual(colors, [RED, GREEN, GREEN, BLUE, BLUE]);
    });
  });

  describe('categories', function () {
    var palette = {type: 'categorical', categories: [1, 5, 7], colors: ['red', 'green', 'blue']};

    it('color each category, leaving other values transparent', function () {
      var colors = getColors(render(makeGrid([1, 5, 7, 3], {pixelType: 'int16'}), palette));
      assert.deepEqual(colors, [RED, GREEN, BLUE, CLEAR]);
    });

    it('work for categories too far apart for an array lookup', function () {
      var colors = getColors(render(makeGrid([0, 100000, 5]),
        {type: 'categorical', categories: [0, 100000], colors: ['red', 'blue']}));
      assert.deepEqual(colors, [RED, BLUE, CLEAR]);
    });

    it('are sampled nearest-neighbor when an export is reduced', function () {
      // 4x2 pixels of category 1 on the left and 9 on the right
      var grid = makeGrid([1, 1, 9, 9, 1, 1, 9, 9], {width: 4, height: 2, pixelType: 'int16'});
      var raster = {grid: grid, view: {recipe: {palette: {type: 'categorical',
        categories: [1, 9], colors: ['red', 'blue']}}}};
      var preview = internal.renderRasterExportPreview(raster, [0, 0, 4, 2], 2, 1, {});
      assert.deepEqual(getColors(preview), [RED, BLUE]);
    });
  });

  describe('nodata', function () {
    var palette = {type: 'sequential', breaks: [10], colors: ['red', 'blue']};

    it('is transparent by default, as are NaN values', function () {
      var grid = makeGrid([5, -9999, NaN, 15], {grid: {nodata: -9999}});
      assert.deepEqual(getColors(render(grid, palette)), [RED, CLEAR, CLEAR, BLUE]);
    });

    it('takes the null color', function () {
      var grid = makeGrid([5, -9999], {grid: {nodata: -9999}});
      var colors = getColors(render(grid, Object.assign({nullColor: '#eeeeee'}, palette)));
      assert.deepEqual(colors, [RED, [238, 238, 238, 255]]);
    });

    it('pixels outside the coverage or masked by an alpha band are transparent', function () {
      var withNull = Object.assign({nullColor: '#eeeeee'}, palette);
      var covered = makeGrid([5, 5, 15], {grid: {coverage: new Uint8Array([1, 0, 1])}});
      var alpha = makeGrid([5, 255, 5, 0, 15, 255], {bands: 2,
        grid: {displayBands: {color: [0], alpha: 1}}});
      assert.deepEqual(getColors(render(covered, withNull)), [RED, CLEAR, BLUE]);
      assert.deepEqual(getColors(render(alpha, withNull)), [RED, CLEAR, BLUE]);
    });

    it('are left out when resampling', function () {
      var grid = makeGrid([0, -9999], {grid: {nodata: -9999}});
      var raster = {grid: grid, view: {recipe: {palette: {type: 'sequential', continuous: true,
        breaks: [0, 100], colors: ['#000000', '#ffffff'], interpolation: 'rgb'}}}};
      var preview = internal.renderRasterExportPreview(raster, [0, 0, 2, 1], 1, 1, {});
      assert.deepEqual(getColors(preview), [[0, 0, 0, 255]]);
    });
  });

  describe('bands', function () {
    it('color the palette\'s band, by its number in the source file', function () {
      // file bands 2 and 4
      var grid = makeGrid([5, 15, 15, 5], {bands: 2, grid: {sampleBands: [1, 3],
        displayBands: {color: [0], alpha: -1}}});
      var palette = {type: 'sequential', breaks: [10], colors: ['red', 'blue']};
      assert.deepEqual(getColors(render(grid, Object.assign({band: 2}, palette))), [RED, BLUE]);
      assert.deepEqual(getColors(render(grid, Object.assign({band: 4}, palette))), [BLUE, RED]);
      assert.throws(function() { render(grid, Object.assign({band: 1}, palette)); }, /does not have band 1/);
    });

    it('average only the palette\'s band when an export is reduced', function () {
      var grid = makeGrid([0, 1000, 100, 1000], {bands: 2, grid: {displayBands: {color: [0], alpha: -1}}});
      var raster = {grid: grid, view: {recipe: {palette: {band: 1, type: 'sequential', continuous: true,
        breaks: [0, 100], colors: ['#000000', '#ffffff'], interpolation: 'rgb'}}}};
      var preview = internal.renderRasterExportPreview(raster, [0, 0, 2, 1], 1, 1, {});
      assert(Math.abs(getColors(preview)[0][0] - 128) <= 1);
    });

    it('getRasterPaletteBandGrid() copies the palette\'s band', function () {
      var grid = makeGrid([5, 1, 255, 6, 2, 0], {bands: 3, grid: {sampleBands: [0, 1, 2],
        displayBands: {color: [0], alpha: 2}}});
      var copy = internal.getRasterPaletteBandGrid(grid, {palette: {band: 2}});
      assert.equal(copy.bands, 1);
      assert.deepEqual(Array.from(copy.samples), [1, 2]);
      assert.deepEqual(copy.sampleBands, [1]);
      assert.deepEqual(Array.from(copy.coverage), [1, 0]);
      assert.strictEqual(copy.displayBands, undefined);
      assert.equal(internal.getRasterPaletteBandGrid(grid, {}), grid);
    });
  });

  it('a palette raster is not scanned for gray scaling stats', function () {
    var raster = {grid: makeGrid([1, 2, 3], {pixelType: 'int16'}),
      view: {recipe: {palette: {type: 'sequential', breaks: [2], colors: ['red', 'blue']}}}};
    assert.strictEqual(internal.getRasterViewScalingStats(raster), null);
    assert.strictEqual(raster.view.scalingStats, undefined);
  });

  it('getRasterPaletteKey() changes with the colors', function () {
    var a = {type: 'sequential', breaks: [2], colors: ['red', 'blue']};
    var b = Object.assign({}, a, {colors: ['red', 'green']});
    assert.notEqual(internal.getRasterPaletteKey(a), internal.getRasterPaletteKey(b));
    assert.equal(internal.getRasterPaletteKey(a), internal.getRasterPaletteKey(Object.assign({}, a)));
  });

  describe('SVG export', function () {
    function getDataset(recipe) {
      return {
        info: {crs_string: 'wgs84'},
        layers: [{
          name: 'raster',
          raster_type: 'grid',
          raster: {
            sourceId: 'raster',
            grid: makeGrid([1, 9], {pixelType: 'int16'}),
            view: {recipe: recipe}
          }
        }]
      };
    }

    it('writes a categorical palette as PNG, in the palette\'s colors', function () {
      var file = internal.exportSVG(getDataset({palette: {type: 'categorical',
        categories: [1, 9], colors: ['red', 'blue']}}), {format: 'svg', margin: 0, width: 20})[0];
      var match = /data:image\/png;base64,([^"]+)/.exec(file.content);
      var png = PNG.sync.read(Buffer.from(match[1], 'base64'));
      assert.deepEqual(Array.from(png.data.slice(0, 4)), RED);
      assert.deepEqual(Array.from(png.data.slice(4, 8)), BLUE);
    });

    it('writes the display opacity as an attribute of the image', function () {
      var file = internal.exportSVG(getDataset({opacity: 0.6, palette: {type: 'sequential',
        breaks: [5], colors: ['red', 'blue']}}), {format: 'svg', margin: 0, width: 20})[0];
      assert(/<image[^>]+opacity="0.6"/.test(file.content));
    });

    it('a raster without opacity has no opacity attribute', function () {
      var file = internal.exportSVG(getDataset({palette: {type: 'sequential',
        breaks: [5], colors: ['red', 'blue']}}), {format: 'svg', margin: 0, width: 20})[0];
      assert(!/<image[^>]+opacity=/.test(file.content));
    });
  });
});
