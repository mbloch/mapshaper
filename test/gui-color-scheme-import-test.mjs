import assert from 'assert';
import {
  getDefaultScheme, getDefaultSchemeOfType, getDefaultCategoricalScheme, setTileCount, setSchemeContinuous,
  setSchemeSplit, updateDivergingLayout, choosePreset, formatSchemeCommand, getAppliedColors,
  getCategories, getSchemeColors, reverseScheme, setSchemeBreak, setSchemeNullColor, setTileColor,
  getContinuousTileStops
} from '../src/gui/gui-color-scheme-model';
import { formatSchemeJSON, formatSchemeCPT } from '../src/gui/gui-color-scheme-export';
import { importColorPalette, parsePalette, parseCPT } from '../src/gui/gui-color-scheme-import';
import api from '../mapshaper.js';

var internal = api.internal;
var values = [-40, -30, -20, -10, 5, 10, 20, 30, 40, 50, 60, 70];

function makeLayer(records) {
  return {name: 'counties', geometry_type: 'polygon', shapes: records.map(function() { return null; }),
    data: new internal.DataTable(records)};
}

function testLayer() {
  return makeLayer(values.map(function(v) { return {change: v, name: v < 0 ? 'down town' : 'up'}; })
    .concat([{change: null, name: ''}]));
}

// the command that colors the layer: the same command, the same fills
function getCommand(scheme, lyr) {
  var count = scheme.type == 'categorical' ? getCategories(lyr, scheme.field).length : -1;
  return formatSchemeCommand(updateDivergingLayout(scheme, lyr), getAppliedColors(updateDivergingLayout(scheme, lyr), count));
}

describe('gui-color-scheme-import.mjs', function () {

  describe('round trips of exported palettes', function() {
    var lyr = testLayer();
    var seq = getDefaultScheme('change');
    var div = getDefaultSchemeOfType('diverging', lyr);
    var schemes = {
      'a custom ramp': seq,
      'a pinned ramp': setTileColor(seq, 2, '#ff0000'),
      'a preset': setTileCount(choosePreset(seq, 'Blues'), 6),
      'a reversed preset': reverseScheme(choosePreset(seq, 'Viridis')),
      'continuous colors': setSchemeContinuous(choosePreset(seq, 'Viridis'), true),
      'custom breaks': setSchemeBreak(seq, lyr, 1, 0),
      'a no-data color': setSchemeNullColor(seq, '#123456'),
      'a diverging preset': div,
      'continuous diverging colors': updateDivergingLayout(setSchemeContinuous(div, true), lyr),
      'classes by number per side': updateDivergingLayout(setSchemeSplit(div, 'count'), lyr),
      'custom diverging breaks': setSchemeBreak(div, lyr, 0, -25),
      'categories': getDefaultCategoricalScheme(lyr),
      'custom categories': setTileColor(getDefaultCategoricalScheme(lyr), 0, '#ff0000')
    };

    Object.keys(schemes).forEach(function(name) {
      ['cpt', 'json'].forEach(function(ext) {
        it(name + ' (' + ext + ')', function() {
          var scheme = updateDivergingLayout(schemes[name], lyr);
          var text = ext == 'cpt' ? formatSchemeCPT(scheme, lyr) : formatSchemeJSON(scheme, lyr);
          var result = importColorPalette(text, getDefaultScheme('change'), lyr);
          assert.equal(result.note, null);
          assert.equal(result.scheme.type, scheme.type);
          assert.equal(getCommand(result.scheme, lyr), getCommand(scheme, lyr));
          assert.equal(result.scheme.preset || null, scheme.preset || null);
        });
      });
    });

    it('the files have the -classify command', function() {
      var cpt = formatSchemeCPT(seq, lyr);
      var json = JSON.parse(formatSchemeJSON(seq, lyr));
      assert(cpt.includes('\n# mapshaper: ' + getCommand(seq, lyr) + '\n'));
      assert.equal(json.command, getCommand(seq, lyr));
    });

    it('a palette for a field this layer doesn\'t have keeps its colors', function() {
      var other = makeLayer(values.map(function(v) { return {pop: v * 10}; }));
      var text = formatSchemeCPT(setTileCount(choosePreset(seq, 'Blues'), 4), lyr);
      var result = importColorPalette(text, getDefaultScheme('pop'), other);
      assert(/field this layer doesn't have/.test(result.note));
      assert.equal(result.scheme.field, 'pop');
      assert.deepEqual(getSchemeColors(result.scheme), getSchemeColors(setTileCount(choosePreset(seq, 'Blues'), 4)));
    });
  });

  describe('GMT tables from other programs', function() {
    var lyr = testLayer();
    var seq = getDefaultScheme('change');

    it('classes that cover the data are custom breaks', function() {
      var text = '# elevation\n-50\t255/0/0\t0\t255/0/0\n0\t0/0/255\t100\t0/0/255\t;high\nB black\nF white\nN 128\n';
      var result = importColorPalette(text, seq, lyr);
      assert.equal(result.note, null);
      assert.equal(result.scheme.method, 'breaks');
      assert.deepEqual(result.scheme.breaks, [0]);
      assert.deepEqual(getSchemeColors(result.scheme), ['#ff0000', '#0000ff']);
      assert.equal(result.scheme.nullColor, '#808080');
    });

    it('classes that the data don\'t reach are left out', function() {
      var text = '-100 red -50 red\n-50 orange 0 orange\n0 yellow 50 yellow\n50 green 100 green\n100 blue 200 blue\n';
      var result = importColorPalette(text, seq, lyr);
      assert.deepEqual(result.scheme.breaks, [0, 50]);
      assert.deepEqual(getSchemeColors(result.scheme), ['#ffa500', '#ffff00', '#008000']);
    });

    it('continuous colors are stops at the min, the values between and the max', function() {
      var text = '-50 255/0/0 0 255/255/255\n0 255/255/255 100 0/0/255\n';
      var result = importColorPalette(text, seq, lyr);
      var scheme = result.scheme;
      assert(scheme.continuous);
      assert.deepEqual(scheme.breaks, [0]);
      assert.deepEqual(getContinuousTileStops(scheme, lyr).map(function(s) { return s.value; }), [-40, 0, 70]);
      // GMT's RGB interpolation, at -40 and 70
      assert.deepEqual(getSchemeColors(scheme), ['#ff3333', '#ffffff', '#4d4dff']);
    });

    it('a table in columns of numbers, by its color model', function() {
      var rgb = parseCPT('# COLOR_MODEL = RGB\n0 255 0 0 10 0 0 255\n');
      var hsv = parseCPT('# COLOR_MODEL = +HSV\n0 0 1 1 10 240 1 1\n');
      assert.deepEqual(rgb.classes[0].colors, ['#ff0000', '#0000ff']);
      assert.deepEqual(hsv.classes[0].colors, ['#ff0000', '#0000ff']);
    });

    it('colors in all of GMT\'s forms', function() {
      var palette = parseCPT([
        '0 255/0/0 1 0-1-1', '1 #00ff00 2 0/0/0/100', '2 128 3 navy@50', '3 0/100/100/0 4 0/0/255 L'
      ].join('\n'));
      assert.deepEqual(palette.classes.map(function(c) { return c.colors; }), [
        ['#ff0000', '#ff0000'], ['#00ff00', '#000000'], ['#808080', '#000080'], ['#ff0000', '#0000ff']
      ]);
    });

    it('a table whose values don\'t cover the data gives its colors', function() {
      var text = '0 255/255/255 1 0/0/255\n';
      var result = importColorPalette(text, setTileCount(seq, 3), lyr);
      assert(/don't cover change \(-40 to 70\)/.test(result.note));
      assert.equal(result.scheme.method, 'quantile');
      assert.deepEqual(getSchemeColors(result.scheme), ['#ffffff', '#8080ff', '#0000ff']);
    });

    it('colors go into a diverging ramp, over all its tiles', function() {
      var div = getDefaultSchemeOfType('diverging', lyr);
      var result = importColorPalette('#ff0000 #ffffff #0000ff', div, lyr);
      var colors = getSchemeColors(updateDivergingLayout(result.scheme, lyr));
      assert.equal(result.scheme.type, 'diverging');
      assert.equal(colors.length, getSchemeColors(div).length);
      assert.equal(colors[0], '#ff0000');
      assert.equal(colors[(colors.length - 1) / 2], '#ffffff');
      assert.equal(colors[colors.length - 1], '#0000ff');
    });

    it('categories go to a field that has them all, by key or label', function() {
      var text = 'down_town\t255/0/0\t;Down town\nup\t0/0/255\nsideways\t0/255/0\n';
      var result = importColorPalette(text, seq, lyr);
      assert.equal(result.note, null);
      assert.equal(result.scheme.type, 'categorical');
      assert.equal(result.scheme.field, 'name');
      assert.deepEqual(getAppliedColors(result.scheme, 2), ['#ff0000', '#0000ff']);
    });

    it('categories that no field has give their colors', function() {
      var result = importColorPalette('a red\nb blue\n', seq, lyr);
      assert(/only its colors/.test(result.note));
      assert.equal(result.scheme.type, 'categorical');
      assert.deepEqual(result.scheme.swatches.slice(0, 2), ['#ff0000', '#0000ff']);
    });
  });

  describe('other text', function() {
    var lyr = testLayer();

    it('a list of colors', function() {
      assert.deepEqual(parsePalette('#f00, #00ff00\nblue rgb(1,2,3)').colors,
        ['#ff0000', '#00ff00', '#0000ff', '#010203']);
      var expected = ['#364774', '#984b64', '#c46c62'];
      [
        '#364774, #984b64, #c46c62', '#364774,#984b64,#c46c62', '#364774 #984b64 #c46c62',
        '"#364774", "#984b64", "#c46c62"', '\'#364774\' \'#984b64\' \'#c46c62\'',
        '“#364774”, “#984b64”, “#c46c62”', '[\'#364774\', \'#984b64\', \'#c46c62\']',
        '["#364774", "#984b64", "#c46c62"]'
      ].forEach(function(str) {
        assert.deepEqual(parsePalette(str).colors, expected, str);
      });
      var result = importColorPalette('#f00 #0f0 #00f', getDefaultScheme('change'), lyr);
      assert.deepEqual(getSchemeColors(result.scheme), ['#ff0000', '#00ff00', '#0000ff']);
    });

    it('a JSON array of colors, and JSON classes without a command', function() {
      assert.deepEqual(parsePalette('["red", "#00f"]').colors, ['#ff0000', '#0000ff']);
      var palette = parsePalette(JSON.stringify({classes: [{from: 0, to: 1, color: 'red'}, {from: 1, to: 2, colors: ['red', 'blue']}]}));
      assert.equal(palette.kind, 'classes');
      assert.deepEqual(palette.classes[1].colors, ['#ff0000', '#0000ff']);
    });

    it('text that isn\'t a palette has a message', function() {
      assert.throws(function() { parsePalette(''); }, /no palette/);
      assert.throws(function() { parsePalette('hello there world'); }, /isn't a GMT color palette table/);
      assert.throws(function() { parsePalette('0 red 1 red\nhello there world'); }, /Line 2 of the table/);
      assert.throws(function() { parsePalette('0 red 1 nocolor'); }, /can't be read: nocolor/);
      assert.throws(function() { parsePalette('{"a": 1}'); }, /no classes or colors/);
      assert.throws(function() { parsePalette('{bad'); }, /JSON can't be read/);
      assert.throws(function() { parsePalette('0 red 1 red\nkey blue'); }, /both ranges of values and categories/);
    });
  });
});
