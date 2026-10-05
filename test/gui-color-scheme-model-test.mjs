import assert from 'assert';
import {
  getDefaultScheme, getSchemeColors, getPinnedTiles, choosePreset, makeSchemeCustom,
  setTileColor, clearTileColor, setTileCount, reverseScheme, formatSchemeCommand,
  getSequentialPresetNames, getPresetGroups, getNumericFields, setLayerScheme, getLayerScheme,
  getPresetColors, getSchemeVibrance, setSchemeVibrance, defaultVibrance, maxVibrance,
  getSchemeTiles, getTileEditColor, setSchemeLongHue,
  getDefaultCategoricalScheme, getDefaultSchemeOfType, getCategoryFields, getCategories,
  getSwatchCategories, getCategoricalPresetColors, getMaxSchemeColors, setSchemeField,
  setSchemeMethod, getAppliedColors, maxCategoricalColors, getCategoricalPalette,
  moveSwatch, shuffleScheme, getSchemeNullColor, setSchemeNullColor, getNoDataCount,
  defaultNullColor, updateDivergingLayout, getDivergingTileUse, getDivergingClassRanges,
  getPivotSummary, setSchemePivot, setSchemeNeutral, setSchemeSplit, getCenterTile,
  getSequentialClassRanges, setSchemeContinuous, isContinuousScheme, getSchemeNeutral,
  getContinuousTileStops, getContinuousSegments, getAppliedScheme, getFillFingerprint,
  setSchemeRangeEnd, getDisplayRange, getDefaultDivergingScheme,
  getSchemeBreaks, setSchemeBreak, resizeBreaks, getRoundestNumber, getBreaksScale, getHistogram,
  getBreakClassSwatches, getBreakClassCounts
} from '../src/gui/gui-color-scheme-model';
import { getRankPositionFunction } from '../src/classification/mapshaper-class-stats';
import api from '../mapshaper.js';

var internal = api.internal;

// a categorical scheme with Tableau10, whose colors some tests list
function getTableauScheme() {
  return choosePreset(getDefaultCategoricalScheme(makeLayer([{}])), 'Tableau10');
}

function round3(val) {
  return Math.round(val * 1000) / 1000;
}

function makeLayer(records) {
  return {geometry_type: 'polygon', shapes: records.map(function() { return null; }),
    data: new internal.DataTable(records)};
}

describe('gui-color-scheme-model.mjs', function() {

  describe('custom ramps', function() {
    it('the default is a two-color ramp pinned at both ends', function() {
      var scheme = getDefaultScheme('pop');
      assert.equal(scheme.field, 'pop');
      assert.equal(getSchemeColors(scheme).length, 5);
      assert.deepEqual(getPinnedTiles(scheme), [true, false, false, false, true]);
    });

    it('setting a tile pins it, and clearing it unpins it', function() {
      var scheme = setTileColor(getDefaultScheme('pop'), 2, '#ff0000');
      assert.deepEqual(getPinnedTiles(scheme), [true, false, true, false, true]);
      assert.equal(getSchemeColors(scheme)[2], '#ff0000');
      scheme = clearTileColor(scheme, 2);
      assert.deepEqual(getPinnedTiles(scheme), [true, false, false, false, true]);
      assert.deepEqual(getSchemeColors(scheme), getSchemeColors(getDefaultScheme('pop')));
    });

    it('vibrance sets the midtone boost of the interpolated tiles', function() {
      var scheme = getDefaultScheme('pop');
      var pins = scheme.pins;
      assert.equal(getSchemeVibrance(scheme), defaultVibrance);
      assert.deepEqual(getSchemeColors(scheme), internal.resolveRamp(pins, 5, {vibrance: defaultVibrance}));
      assert.deepEqual(getSchemeColors(setSchemeVibrance(scheme, 0)), internal.resolveRamp(pins, 5));
      assert.notDeepEqual(getSchemeColors(setSchemeVibrance(scheme, 1)), getSchemeColors(scheme));
    });

    it('the default ramp runs from cream to blue', function() {
      assert.deepEqual(getSchemeColors(getDefaultScheme('pop')),
        ['#fff8da', '#b9d4af', '#67b0a1', '#20839e', '#2d4d8e']);
    });

    it('vibrance starts at 0, and goes up to 0.09', function() {
      assert.equal(getDefaultScheme('pop').vibrance, 0);
      assert.equal(maxVibrance, 0.09);
    });

    it('longHue takes the long way around the color wheel', function() {
      var scheme = getDefaultScheme('pop');
      var long = setSchemeLongHue(scheme, true);
      assert.strictEqual(long.longHue, true);
      assert.deepEqual(getSchemeColors(long), internal.resolveRamp(scheme.pins, 5, {hue: 'longer'}));
      assert.notDeepEqual(getSchemeColors(long), getSchemeColors(scheme));
      assert.deepEqual(getSchemeColors(setSchemeLongHue(long, false)), getSchemeColors(scheme));
      assert.strictEqual(reverseScheme(long).longHue, true);
    });

    it('vibrance is kept from 0 to its maximum, with a default for older schemes', function() {
      var scheme = getDefaultScheme('pop');
      assert.equal(setSchemeVibrance(scheme, 2).vibrance, maxVibrance);
      assert.equal(setSchemeVibrance(scheme, -1).vibrance, 0);
      delete scheme.vibrance;
      assert.equal(getSchemeVibrance(scheme), defaultVibrance);
    });

    it('tiles say which are pinned, and which were fitted to the gamut', function() {
      var scheme = Object.assign(getDefaultScheme('pop'), {
        pins: [{t: 0, color: '#001e56'}, {t: 1, color: '#fcf1cd'}],
        vibrance: 0.06
      });
      var tiles = getSchemeTiles(scheme);
      assert.deepEqual(tiles.map(function(t) { return t.pinned; }), [true, false, false, false, true]);
      // the navy end has no room in the gamut for more chroma
      assert.equal(tiles[0].adjusted, true);
      assert(tiles.slice(1, 4).some(function(t) { return t.adjusted; }));
      assert(getSchemeTiles(choosePreset(scheme, 'Blues')).every(function(t) { return !t.adjusted; }));
    });

    it('end tiles cannot be unpinned', function() {
      var scheme = clearTileColor(getDefaultScheme('pop'), 0);
      assert.deepEqual(getPinnedTiles(scheme), [true, false, false, false, true]);
    });

    it('pins keep their place as the number of tiles changes', function() {
      var scheme = setTileColor(getDefaultScheme('pop'), 2, '#ff0000');
      scheme = setTileCount(scheme, 9);
      assert.deepEqual(getPinnedTiles(scheme),
        [true, false, false, false, true, false, false, false, true]);
      assert.equal(getSchemeColors(scheme)[4], '#ff0000');
    });

    it('the number of tiles is kept in range', function() {
      assert.equal(setTileCount(getDefaultScheme(), 1).n, 2);
      assert.equal(setTileCount(getDefaultScheme(), 40).n, 12);
    });

    it('reversing flips the pins', function() {
      var scheme = setTileColor(getDefaultScheme('pop'), 1, '#ff0000');
      var colors = getSchemeColors(scheme);
      var rev = reverseScheme(scheme);
      assert.deepEqual(getSchemeColors(rev), colors.concat().reverse());
      assert.deepEqual(getPinnedTiles(rev), [true, false, false, true, true]);
    });
  });

  describe('presets', function() {
    it('lists sequential and multi-hue ramps, without the cyclic ones', function() {
      var names = getSequentialPresetNames();
      assert(names.includes('Blues'));
      assert(names.includes('Viridis'));
      assert(!names.includes('Sinebow'));
      assert(!names.includes('Category10'));
    });

    it('groups presets by source, with multi-hue ramps among the sequential ones', function() {
      var groups = getPresetGroups('sequential');
      assert.deepEqual(groups.map(function(g) { return g.source; }),
        ['ColorBrewer', 'Matplotlib', 'Crameri', 'd3']);
      assert(groups[2].names.includes('batlow'));
      assert(!groups[3].names.includes('Sinebow'));
      assert.deepEqual(getPresetGroups('categorical').map(function(g) { return g.source; }),
        ['ColorBrewer', 'Tableau', 'Crameri', 'd3']);
      assert.deepEqual(getSequentialPresetNames(), groups.reduce(function(memo, g) {
        return memo.concat(g.names);
      }, []));
    });

    it('trimming an end tile off the range, with one tile fewer, keeps the colors of the others', function() {
      ['davos', 'Viridis', 'Blues'].forEach(function(name) {
        var scheme = setTileCount(choosePreset(getDefaultScheme('pop'), name), 7);
        var colors = getSchemeColors(scheme);
        var trimmed = setSchemeRangeEnd(setSchemeRangeEnd(scheme, 'right', 5 / 6), 'left', 1 / 6);
        var five = setTileCount(trimmed, 5);
        assert.deepEqual(getSchemeColors(five), colors.slice(1, 6), name);
        assert.equal(five.preset, name);
      });
    });

    it('the range of a reversed preset is trimmed on the side that is moved', function() {
      var scheme = reverseScheme(setTileCount(choosePreset(getDefaultScheme('pop'), 'davos'), 7));
      var colors = getSchemeColors(scheme);
      var six = setTileCount(setSchemeRangeEnd(scheme, 'left', 1 / 6), 6);
      assert.deepEqual(getSchemeColors(six), colors.slice(1));
      assert.deepEqual(getDisplayRange(six).map(round3), [0.167, 1]);
      // reversing again flips the range with the colors
      assert.deepEqual(getSchemeColors(reverseScheme(six)), colors.slice(1).reverse());
    });

    it('a range resamples the preset when the number of colors changes', function() {
      var scheme = setSchemeRangeEnd(choosePreset(getDefaultScheme('pop'), 'batlow'), 'right', 0.8);
      var colors = getSchemeColors(setTileCount(scheme, 9));
      assert.equal(colors.length, 9);
      assert.equal(colors[0], getPresetColors('batlow', 2)[0]);
      assert.equal(colors[8], getPresetColors('batlow', 6)[4]);
    });

    it('a range keeps a minimum span, and covering the whole ramp clears it', function() {
      var scheme = choosePreset(getDefaultScheme('pop'), 'batlow');
      var narrow = setSchemeRangeEnd(setSchemeRangeEnd(scheme, 'left', 0.5), 'right', 0.2);
      assert.deepEqual(getDisplayRange(narrow).map(round3), [0.5, 0.6]);
      assert.strictEqual(setSchemeRangeEnd(setSchemeRangeEnd(scheme, 'left', 0.5), 'left', 0).range, null);
      assert.strictEqual(choosePreset(narrow, 'oslo').range, null);
      assert.strictEqual(makeSchemeCustom(narrow).range, null);
      assert.deepEqual(getSchemeColors(makeSchemeCustom(narrow)).slice(0, 1), getSchemeColors(narrow).slice(0, 1));
    });

    it('a diverging range is trimmed at both ends, keeping the center', function() {
      var scheme = choosePreset(getDefaultDivergingScheme(makeLayer([{v: -2}, {v: -1}, {v: 1}, {v: 2}])), 'vik');
      var full = getSchemeColors(scheme);
      var trimmed = setSchemeRangeEnd(scheme, 'right', 0.8);
      var colors = getSchemeColors(trimmed);
      var mid = (colors.length - 1) / 2;
      assert.deepEqual(getDisplayRange(trimmed).map(round3), [0.2, 0.8]);
      assert.equal(colors[mid], full[mid]);
      assert.notEqual(colors[0], full[0]);
    });

    it('Crameri presets give hex colors', function() {
      var colors = getSchemeColors(choosePreset(getDefaultScheme('pop'), 'batlow'));
      assert.equal(colors[0], '#011959');
      assert.equal(colors[4], '#faccfa');
    });

    it('preset colors are hex, with no tiles pinned', function() {
      var scheme = choosePreset(getDefaultScheme('pop'), 'Viridis');
      var colors = getSchemeColors(scheme);
      assert.equal(colors.length, 5);
      colors.forEach(function(c) { assert(/^#[0-9a-f]{6}$/.test(c), c); });
      assert.deepEqual(getPinnedTiles(scheme), [false, false, false, false, false]);
      // more colors than d3 has stored
      assert.equal(getSchemeColors(setTileCount(choosePreset(scheme, 'Blues'), 12)).length, 12);
    });

    it('a reversed preset reverses its colors', function() {
      var scheme = choosePreset(getDefaultScheme('pop'), 'Blues');
      assert.deepEqual(getSchemeColors(reverseScheme(scheme)), getSchemeColors(scheme).reverse());
    });

    it('editing a preset tile makes a custom ramp, pinned at the ends and the tile', function() {
      var scheme = choosePreset(getDefaultScheme('pop'), 'Viridis');
      var preset = getSchemeColors(scheme);
      var edited = setTileColor(scheme, 2, 'red');
      var colors = getSchemeColors(edited);
      assert.strictEqual(edited.preset, null);
      assert.deepEqual(getPinnedTiles(edited), [true, false, true, false, true]);
      // the pins are the preset's colors; vibrance raises them in the ramp
      assert.equal(getTileEditColor(edited, 0), preset[0]);
      assert.equal(getTileEditColor(edited, 4), preset[4]);
      assert.equal(colors[0], internal.getVibrantColor(preset[0], defaultVibrance));
      assert.equal(colors[2], internal.getVibrantColor('#ff0000', defaultVibrance));
      assert.equal(colors[4], internal.getVibrantColor(preset[4], defaultVibrance));
    });

    it('a reversed preset made custom keeps its order', function() {
      var scheme = reverseScheme(choosePreset(getDefaultScheme('pop'), 'Blues'));
      var custom = makeSchemeCustom(scheme);
      var colors = getSchemeColors(scheme);
      assert.equal(getTileEditColor(custom, 0), colors[0]);
      assert.equal(getTileEditColor(custom, 4), colors[4]);
    });

    it('unpinning a preset does nothing', function() {
      var scheme = choosePreset(getDefaultScheme('pop'), 'Blues');
      assert.strictEqual(clearTileColor(scheme, 2), scheme);
    });

    it('getPresetColors() gives d3 colors as hex', function() {
      assert.deepEqual(getPresetColors('Greys', 2).length, 2);
    });
  });

  describe('formatSchemeCommand()', function() {
    it('writes explicit colors', function() {
      var cmd = formatSchemeCommand(getDefaultScheme('pop 2020'), ['#000000', '#ffffff']);
      assert.equal(cmd, "-classify field='pop 2020' method=quantile colors=#000000,#ffffff");
    });

    it('adds a target', function() {
      var cmd = formatSchemeCommand(getDefaultScheme('pop'), ['#000000', '#ffffff'], {target: 'states'});
      assert.equal(cmd, "-classify field='pop' method=quantile colors=#000000,#ffffff target=states");
    });

    it('runs as a -classify command', async function() {
      var scheme = getDefaultScheme('value');
      var colors = getSchemeColors(scheme);
      var cmd = formatSchemeCommand(scheme, colors);
      var csv = 'value\n1\n2\n3\n4\n5';
      var out = await api.applyCommands('-i data.csv ' + cmd + ' -o format=json', {'data.csv': csv});
      var fills = JSON.parse(out['data.json']).map(function(d) { return d.fill; });
      assert.deepEqual(fills, colors);
    });
  });

  describe('layer schemes', function() {
    it('numeric fields are offered for classification', function() {
      var lyr = makeLayer([{name: 'a', pop: 3, fill: 'red'}]);
      assert.deepEqual(getNumericFields(lyr), ['pop']);
    });

    it('a scheme is kept while the fills are its colors', function() {
      var lyr = makeLayer([{pop: 1, fill: '#000000'}, {pop: null, fill: '#eee'}, {pop: 3, fill: '#FFFFFF'}]);
      var scheme = Object.assign(getDefaultScheme('pop'), {colors: ['#000000', '#ffffff']});
      setLayerScheme(lyr, scheme);
      assert.strictEqual(getLayerScheme(lyr), scheme);
    });

    it('a fill set some other way retires the scheme', function() {
      var lyr = makeLayer([{pop: 1, fill: '#000000'}, {pop: 3, fill: '#ffffff'}]);
      setLayerScheme(lyr, Object.assign(getDefaultScheme('pop'), {colors: ['#000000', '#ffffff']}));
      lyr.data.getRecords()[1].fill = 'red';
      assert.strictEqual(getLayerScheme(lyr), null);
    });

    it('a missing data field retires the scheme', function() {
      var lyr = makeLayer([{fill: '#000000'}]);
      setLayerScheme(lyr, Object.assign(getDefaultScheme('pop'), {colors: ['#000000', '#ffffff']}));
      assert.strictEqual(getLayerScheme(lyr), null);
    });

    it('a non-adjacent scheme has no field to go missing', function() {
      var lyr = makeLayer([{fill: '#000000'}]);
      var scheme = Object.assign(getDefaultCategoricalScheme(lyr), {colors: ['#000000', '#ffffff']});
      assert.equal(scheme.method, 'non-adjacent');
      setLayerScheme(lyr, scheme);
      assert.strictEqual(getLayerScheme(lyr), scheme);
    });
  });

  describe('categorical schemes', function() {
    var records = [
      {code: 3, kind: 'farm', fill: 'red'},
      {code: 1, kind: 'city', fill: 'red'},
      {code: 3, kind: 'farm', fill: 'red'},
      {code: 2, kind: 'park', fill: 'red'}
    ];
    var tableau = ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949',
      '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'];

    it('text and number fields can be categories, but not the fill', function() {
      assert.deepEqual(getCategoryFields(makeLayer(records)), ['code', 'kind']);
    });

    it('defaults to the first text field, with a swatch for each value', function() {
      var lyr = makeLayer(records);
      var scheme = getDefaultCategoricalScheme(lyr);
      assert.equal(scheme.type, 'categorical');
      assert.equal(scheme.field, 'kind');
      assert.equal(scheme.method, 'categorical');
      assert.equal(scheme.preset, 'batlowS');
      assert.equal(scheme.n, 3);
      assert.deepEqual(getSchemeColors(scheme), getCategoricalPresetColors('batlowS').slice(0, 3));
      assert.deepEqual(getDefaultSchemeOfType('categorical', lyr), scheme);
    });

    it('categories are the field\'s values in the order -classify uses', function() {
      assert.deepEqual(getCategories(makeLayer(records), 'kind'), ['farm', 'city', 'park']);
    });

    it('a layer without fields defaults to non-adjacent colors', function() {
      var scheme = getDefaultCategoricalScheme(makeLayer([{}, {}]));
      assert.equal(scheme.method, 'non-adjacent');
      assert.strictEqual(scheme.field, null);
      assert.equal(getSchemeColors(scheme).length, 5);
    });

    it('the swatch count is limited by the palette and the categories', function() {
      var scheme = getDefaultCategoricalScheme(makeLayer(records));
      assert.equal(getMaxSchemeColors(scheme, 3), 3);
      assert.equal(getMaxSchemeColors(scheme, 50), 20);
      assert.equal(getMaxSchemeColors(scheme, 1), 2);
      assert.equal(setTileCount(scheme, 8, 3).n, 3);
      scheme = setSchemeMethod(scheme, 'non-adjacent');
      assert.equal(setTileCount(scheme, 25, 3).n, 20);
      assert.equal(setTileCount(makeSchemeCustom(scheme), 30, 3).n, maxCategoricalColors);
    });

    it('a new field gets a swatch for each of its values', function() {
      var scheme = setSchemeField(getDefaultCategoricalScheme(makeLayer(records)), 'code', 3);
      assert.equal(scheme.field, 'code');
      assert.equal(scheme.n, 3);
      assert.equal(setSchemeField(scheme, 'x', 40).n, 20);
    });

    it('changing to the categorical method picks a field', function() {
      var scheme = getDefaultCategoricalScheme(makeLayer([{}, {}]));
      scheme = setSchemeMethod(setTileCount(scheme, 8), 'categorical', 'kind', 3);
      assert.equal(scheme.field, 'kind');
      assert.equal(scheme.n, 3);
    });

    it('choosing a preset with fewer colors limits the swatch count', function() {
      var scheme = setSchemeMethod(getDefaultCategoricalScheme(makeLayer([{}])), 'non-adjacent');
      scheme = choosePreset(setTileCount(choosePreset(scheme, 'Category20'), 15), 'Set1');
      assert.equal(scheme.n, 9);
    });

    it('editing a swatch makes a custom list, which keeps its colors as it grows', function() {
      var scheme = getTableauScheme();
      var custom = setTileColor(scheme, 1, '#ff0000');
      assert.strictEqual(custom.preset, null);
      assert.deepEqual(getSchemeColors(custom), ['#4e79a7', '#ff0000', '#e15759', '#76b7b2', '#59a14f']);
      // the whole palette, edited
      assert.deepEqual(getCategoricalPalette(custom), ['#4e79a7', '#ff0000'].concat(tableau.slice(2)));
      assert.deepEqual(getSchemeColors(setTileCount(custom, 10)).slice(5), tableau.slice(5));
      // past the palette's colors, more come from Tableau20
      var grown = setTileCount(custom, 20);
      assert.equal(new Set(getSchemeColors(grown)).size, 20);
      assert.equal(getCategoricalPalette(grown).length, maxCategoricalColors);
      assert.deepEqual(getPinnedTiles(custom), [false, false, false, false, false]);
      assert.equal(getTileEditColor(custom, 1), '#ff0000');
    });

    it('shows the whole palette, of which the first n are used', function() {
      var scheme = getDefaultCategoricalScheme(makeLayer([{}]));
      var batlow = getCategoricalPresetColors('batlowS');
      assert.equal(batlow.length, 20);
      assert.deepEqual(getCategoricalPalette(scheme), batlow);
      assert.deepEqual(getSchemeColors(scheme), batlow.slice(0, 5));
    });

    it('non-adjacent colors start at 5', function() {
      var scheme = getDefaultCategoricalScheme(makeLayer(records.concat(records, records)));
      assert.equal(setTileCount(scheme, 3, 3).n, 3);
      assert.equal(setSchemeMethod(setTileCount(scheme, 3, 3), 'non-adjacent').n, 5);
    });

    it('moving a swatch into use pushes the last one out', function() {
      var scheme = getTableauScheme();
      var moved = moveSwatch(scheme, 7, 1);
      assert.equal(moved.preset, 'Tableau10');
      assert.deepEqual(getSchemeColors(moved), [tableau[0], tableau[7], tableau[1], tableau[2], tableau[3]]);
      assert.equal(getCategoricalPalette(moved)[5], tableau[4]);
      // and out of use brings the first unused one in
      moved = moveSwatch(scheme, 0, 9);
      assert.deepEqual(getSchemeColors(moved), tableau.slice(1, 6));
      assert.equal(getCategoricalPalette(moved)[9], tableau[0]);
      // custom lists move their own colors
      var custom = moveSwatch(makeSchemeCustom(scheme), 7, 1);
      assert.deepEqual(getSchemeColors(custom), getSchemeColors(moveSwatch(scheme, 7, 1)));
      // choosing the preset again puts it back in order
      assert.deepEqual(getCategoricalPalette(choosePreset(moveSwatch(scheme, 7, 1), 'Tableau10')), tableau);
    });

    it('shuffles the whole palette, keeping the preset', function() {
      var scheme = getTableauScheme();
      var shuffled = shuffleScheme(scheme, function() { return 0; });
      assert.equal(shuffled.preset, 'Tableau10');
      assert.deepEqual(getCategoricalPalette(shuffled).concat().sort(), tableau.concat().sort());
      assert.notDeepEqual(getCategoricalPalette(shuffled), tableau);
      assert.equal(shuffled.n, 5);
      var custom = shuffleScheme(makeSchemeCustom(scheme), function() { return 0; });
      assert.deepEqual(getCategoricalPalette(custom), getCategoricalPalette(shuffled));
    });

    it('a shuffle that leaves the order as it was is tried again', function() {
      var scheme = getDefaultCategoricalScheme(makeLayer([{}]));
      var palette = getCategoricalPalette(scheme);
      // the first try leaves every swatch in place
      var calls = 0;
      var shuffled = shuffleScheme(scheme, function() { return calls++ < 9 ? 0.9999 : 0; });
      assert.notDeepEqual(getCategoricalPalette(shuffled), palette);
      for (var i=0; i<20; i++) {
        assert.notDeepEqual(getCategoricalPalette(shuffleScheme(scheme)), palette);
      }
    });

    it('swatches are shared by categories in turn', function() {
      assert.deepEqual(getSwatchCategories(['a', 'b', 'c', 'd', 'e'], 2), [['a', 'c', 'e'], ['b', 'd']]);
    });

    it('applies no more colors than there are categories', function() {
      var scheme = Object.assign(getDefaultCategoricalScheme(makeLayer(records)), {n: 5});
      assert.equal(getAppliedColors(scheme, 3).length, 3);
      assert.equal(getAppliedColors(setSchemeMethod(scheme, 'non-adjacent'), 3).length, 5);
    });

    it('writes -classify commands', function() {
      var scheme = getDefaultCategoricalScheme(makeLayer(records));
      assert.equal(formatSchemeCommand(scheme, ['#000000', '#ffffff']),
        "-classify field='kind' method=categorical colors=#000000,#ffffff");
      assert.equal(formatSchemeCommand(setSchemeMethod(scheme, 'non-adjacent'), ['#000000', '#ffffff']),
        '-classify method=non-adjacent colors=#000000,#ffffff');
    });

    it('the command colors each category', async function() {
      var csv = 'kind\nfarm\ncity\nfarm\npark\nlake';
      var lyr = makeLayer([{kind: 'farm'}, {kind: 'city'}, {kind: 'farm'}, {kind: 'park'}, {kind: 'lake'}]);
      var scheme = setTileCount(getDefaultCategoricalScheme(lyr), 2, 4);
      var colors = getAppliedColors(scheme, 4);
      var out = await api.applyCommands('-i data.csv ' + formatSchemeCommand(scheme, colors) + ' -o format=json',
        {'data.csv': csv});
      var fills = JSON.parse(out['data.json']).map(function(d) { return d.fill; });
      assert.deepEqual(fills, [colors[0], colors[1], colors[0], colors[0], colors[1]]);
    });
  });

  describe('no-data color', function() {
    it('defaults to -classify\'s null value, which the command leaves out', function() {
      var scheme = getDefaultScheme('pop');
      assert.equal(getSchemeNullColor(scheme), defaultNullColor);
      assert.equal(formatSchemeCommand(scheme, ['#000000', '#ffffff']),
        "-classify field='pop' method=quantile colors=#000000,#ffffff");
    });

    it('is given to -classify when set', function() {
      var scheme = setSchemeNullColor(getDefaultScheme('pop'), '#FF0000');
      assert.equal(getSchemeNullColor(scheme), '#ff0000');
      assert.equal(formatSchemeCommand(scheme, ['#000000', '#ffffff']),
        "-classify field='pop' method=quantile colors=#000000,#ffffff null-value=#ff0000");
      // but not for non-adjacent colors, which have no data
      var lyr = makeLayer([{}]);
      var nonAdjacent = setSchemeNullColor(getDefaultCategoricalScheme(lyr), '#ff0000');
      assert.equal(formatSchemeCommand(nonAdjacent, ['#000000', '#ffffff']),
        '-classify method=non-adjacent colors=#000000,#ffffff');
    });

    it('an empty or unreadable color is the default', function() {
      var scheme = setSchemeNullColor(getDefaultScheme('pop'), '#ff0000');
      assert.equal(getSchemeNullColor(setSchemeNullColor(scheme, '')), defaultNullColor);
      assert.equal(getSchemeNullColor(setSchemeNullColor(scheme, 'zzz')), defaultNullColor);
    });

    it('counts the features with no data', function() {
      var lyr = makeLayer([{pop: 1, kind: 'a'}, {pop: null, kind: ''}, {pop: 'x', kind: 0}, {pop: NaN}, {pop: 0, kind: 'b'}]);
      assert.equal(getNoDataCount(lyr, getDefaultScheme('pop')), 3);
      var cat = setSchemeField(getDefaultCategoricalScheme(lyr), 'kind', 3);
      assert.equal(getNoDataCount(lyr, cat), 2);
      assert.equal(getNoDataCount(lyr, setSchemeMethod(cat, 'non-adjacent')), 0);
    });

    it('empty values are not categories', function() {
      var lyr = makeLayer([{kind: 'a'}, {kind: ''}, {kind: null}, {}, {kind: 'b'}, {kind: 0}]);
      assert.deepEqual(getCategories(lyr, 'kind'), ['a', 'b', 0]);
    });

    it('a layer keeps its scheme with features in the no-data color', function() {
      var lyr = makeLayer([{pop: 1, fill: '#000000'}, {pop: null, fill: '#ff0000'}]);
      var scheme = Object.assign(setSchemeNullColor(getDefaultScheme('pop'), '#ff0000'), {colors: ['#000000', '#ffffff']});
      setLayerScheme(lyr, scheme);
      assert.strictEqual(getLayerScheme(lyr), scheme);
      setLayerScheme(lyr, Object.assign({}, scheme, {nullColor: '#00ff00'}));
      assert.strictEqual(getLayerScheme(lyr), null);
    });

    it('sequential class ranges are the ones -classify finds', function() {
      var lyr = makeLayer([{pop: 0}, {pop: 10}, {pop: 20}, {pop: 40}, {pop: null}]);
      var scheme = Object.assign(getDefaultScheme('pop'), {method: 'equal-interval', n: 4});
      assert.deepEqual(getSequentialClassRanges(scheme, lyr),
        [[-Infinity, 10], [10, 20], [20, 30], [30, Infinity]]);
      assert.equal(getSequentialClassRanges(getDefaultScheme('missing'), lyr), null);
    });

    it('the command colors the features with no data', async function() {
      var scheme = setSchemeNullColor(getDefaultScheme('value'), '#ff0000');
      var colors = getSchemeColors(setTileCount(scheme, 2));
      var cmd = formatSchemeCommand(setTileCount(scheme, 2), colors);
      var out = await api.applyCommands('-i data.json ' + cmd + ' -o', {'data.json': [{value: 1}, {value: null}, {value: 2}]});
      assert.deepEqual(JSON.parse(out['data.json']).map(function(d) { return d.fill; }), [colors[0], '#ff0000', colors[1]]);
    });
  });

  describe('diverging schemes', function() {
    // 4 values below 0 and 8 above
    var values = [-40, -30, -20, -10, 5, 10, 20, 30, 40, 50, 60, 70];
    function divergingLayer() {
      return makeLayer(values.map(function(v) { return {name: 'x', change: v}; }));
    }

    it('the default is RdBu around an automatic pivot, with a pivot class', function() {
      var scheme = getDefaultSchemeOfType('diverging', divergingLayer());
      assert.equal(scheme.type, 'diverging');
      assert.equal(scheme.field, 'change');
      assert.equal(scheme.preset, 'RdBu');
      assert.equal(scheme.pivot, 'auto');
      assert.equal(scheme.neutral, true);
      assert.equal(scheme.layout.pivot, 0);
    });

    it('has tiles for the longer side on both sides of the center', function() {
      var scheme = getDefaultSchemeOfType('diverging', divergingLayer());
      var layout = scheme.layout;
      var k = Math.max(layout.below, layout.above);
      assert(layout.below < layout.above);
      assert.equal(getSchemeTiles(scheme).length, k * 2 + 1);
      assert.deepEqual(getSchemeColors(scheme), getPresetColors('RdBu', k * 2 + 1));
      // the shorter side uses the tiles nearest the center
      var use = getDivergingTileUse(scheme);
      assert.deepEqual(use.slice(0, k), new Array(k - layout.below).fill(false).concat(new Array(layout.below).fill(true)));
      assert.equal(use[k], true);
      assert.deepEqual(use.slice(k + 1), new Array(k).fill(true));
    });

    it('without a pivot class, the center tile is unused', function() {
      var lyr = divergingLayer();
      var scheme = updateDivergingLayout(setSchemeNeutral(getDefaultSchemeOfType('diverging', lyr), false), lyr);
      var k = (getSchemeTiles(scheme).length - 1) / 2;
      assert.equal(scheme.layout.neutral, null);
      assert.equal(getDivergingTileUse(scheme)[k], false);
    });

    it('a custom ramp is pinned at its ends and center, and the center stays pinned', function() {
      var lyr = divergingLayer();
      var scheme = makeSchemeCustom(getDefaultSchemeOfType('diverging', lyr));
      var center = getCenterTile(scheme);
      var pinned = getPinnedTiles(scheme);
      assert.equal(pinned[0] && pinned[center] && pinned[pinned.length - 1], true);
      assert.equal(pinned.filter(Boolean).length, 3);
      assert.strictEqual(clearTileColor(scheme, center), scheme);
      // reversing keeps the center at the center
      assert.equal(getSchemeColors(reverseScheme(scheme))[center], getSchemeColors(scheme)[center]);
    });

    it('pins keep their place when the number of tiles changes', function() {
      var lyr = divergingLayer();
      var scheme = setTileColor(makeSchemeCustom(getDefaultSchemeOfType('diverging', lyr)), 0, '#000000');
      var bigger = updateDivergingLayout(setTileCount(scheme, 11), lyr);
      assert(getSchemeTiles(bigger).length > getSchemeTiles(scheme).length);
      assert.equal(getSchemeColors(bigger)[0], '#000000');
    });

    it('a number per side', function() {
      var lyr = divergingLayer();
      var scheme = updateDivergingLayout(setSchemeSplit(getDefaultSchemeOfType('diverging', lyr), 'count'), lyr);
      assert.equal(scheme.n, 3);
      assert.equal(scheme.layout.below, 3);
      assert.equal(scheme.layout.above, 3);
      assert.equal(getSchemeTiles(scheme).length, 7);
      assert.equal(getMaxSchemeColors(scheme), 6);
      assert.equal(setTileCount(scheme, 0).n, 1);
    });

    it('the pivot can be a value, the median or the mean', function() {
      var lyr = divergingLayer();
      var scheme = getDefaultSchemeOfType('diverging', lyr);
      assert.equal(updateDivergingLayout(setSchemePivot(scheme, 25), lyr).layout.pivot, 25);
      assert.equal(updateDivergingLayout(setSchemePivot(scheme, 'median'), lyr).layout.pivot, 15);
      assert.deepEqual(getPivotSummary(updateDivergingLayout(setSchemePivot(scheme, 25), lyr), lyr),
        {pivot: 25, below: 7, above: 5});
    });

    it('a field with no numbers has no layout', function() {
      var lyr = divergingLayer();
      var scheme = updateDivergingLayout(setSchemeField(getDefaultSchemeOfType('diverging', lyr), 'name'), lyr);
      assert.equal(scheme.layout, null);
    });

    it('the class ranges of a layout', function() {
      assert.deepEqual(getDivergingClassRanges({breaks: [-1, 1]}),
        [[-Infinity, -1], [-1, 1], [1, Infinity]]);
    });

    it('the command colors the classes as the tiles show them', async function() {
      var lyr = divergingLayer();
      var schemes = [
        getDefaultSchemeOfType('diverging', lyr),
        setSchemeNeutral(getDefaultSchemeOfType('diverging', lyr), false),
        setSchemeSplit(getDefaultSchemeOfType('diverging', lyr), 'count'),
        setSchemePivot(setTileColor(getDefaultSchemeOfType('diverging', lyr), 0, '#000000'), 'median'),
        setSchemeField(Object.assign(getDefaultSchemeOfType('diverging', lyr), {method: 'equal-interval'}), 'change')
      ];
      for (var scheme of schemes) {
        scheme = updateDivergingLayout(scheme, lyr);
        var colors = getAppliedColors(scheme);
        var use = getDivergingTileUse(scheme);
        var classColors = colors.filter(function(c, i) { return use[i]; });
        var cmd = formatSchemeCommand(scheme, colors);
        var out = await api.applyCommands('-i data.json ' + cmd + ' -o', {'data.json': lyr.data.getRecords()});
        var fills = JSON.parse(out['data.json']).map(function(d) { return d.fill; });
        var breaks = scheme.layout.breaks;
        var expected = values.map(function(v) {
          var j = breaks.filter(function(b) { return v >= b; }).length;
          return classColors[j];
        });
        assert.deepEqual(fills, expected, cmd);
      }
    });

    it('the command', function() {
      var lyr = divergingLayer();
      var scheme = getDefaultSchemeOfType('diverging', lyr);
      assert.equal(formatSchemeCommand(scheme, ['#000000', '#ffffff', '#ff0000']),
        "-classify field='change' method=quantile pivot=auto classes=7 colors=#000000,#ffffff,#ff0000");
      scheme = setSchemeSplit(setSchemeNeutral(setSchemePivot(scheme, -2.5), false), 'count');
      assert.equal(formatSchemeCommand(scheme, ['#000000', '#ffffff', '#ff0000']),
        "-classify field='change' method=quantile pivot=-2.5 classes=3,3 no-pivot-class colors=#000000,#ffffff,#ff0000");
    });
  });

  describe('continuous schemes', function() {
    var values = [-40, -30, -20, -10, 5, 10, 20, 30, 40, 50, 60, 70];
    function makeTestLayer() {
      return makeLayer(values.map(function(v) { return {change: v}; }));
    }
    function diverging(lyr, edit) {
      var scheme = setSchemeContinuous(getDefaultSchemeOfType('diverging', lyr), true);
      return updateDivergingLayout(edit ? edit(scheme) : scheme, lyr);
    }
    function hex(color) {
      return internal.formatColor(internal.parseColor(color));
    }

    // the color the tiles give a value: interpolated between the stops
    // around it, on its side of the pivot -- by value, or for quantile by
    // rank, among the data on its side (with the pivot as the innermost value)
    function getExpectedFill(scheme, lyr, v) {
      var stops = getContinuousTileStops(scheme, lyr);
      var colors = getSchemeColors(scheme);
      var layout = scheme.layout;
      var k = getCenterTile(scheme);
      var tiles = stops.map(function(stop, i) { return stop && !stop.range ? i : -1; })
        .filter(function(i) { return i > -1; });
      var edges = layout && layout.neutral || layout && [layout.pivot, layout.pivot];
      if (layout && layout.neutral && v >= edges[0] && v < edges[1]) return hex(colors[k]);
      if (layout) {
        tiles = tiles.filter(function(i) { return v < edges[0] ? i < k : i > k; });
      }
      var getColor = internal.getInterpolatedValueGetter(tiles.map(function(i) { return colors[i]; }),
        null, {interpolation: 'oklch'});
      var ranked, pos;
      if (scheme.method == 'quantile') {
        ranked = values.slice().sort(function(a, b) { return a - b; });
        if (layout) {
          ranked = v < edges[0] ?
            ranked.filter(function(d) { return d < edges[0]; }).concat([edges[0]]) :
            [edges[1]].concat(ranked.filter(function(d) { return d > edges[1]; }));
        }
        pos = getRankPositionFunction(ranked)(v) * (tiles.length - 1);
      } else {
        pos = internal.getStopPosition(tiles.map(function(i) { return stops[i].value; }), v);
      }
      return hex(getColor(pos));
    }

    it('turning continuous on starts a sequential ramp with at least 5 stops', function() {
      assert.equal(setSchemeContinuous(setTileCount(getDefaultScheme('change'), 3), true).n, 5);
      assert.equal(setSchemeContinuous(setTileCount(getDefaultScheme('change'), 7), true).n, 7);
      assert.equal(isContinuousScheme(setSchemeContinuous(getDefaultScheme('change'), true)), true);
    });

    it('sequential stops are at the min, the breaks and the max', function() {
      var lyr = makeTestLayer();
      var scheme = Object.assign(setSchemeContinuous(getDefaultScheme('change'), true), {method: 'equal-interval'});
      var stops = getContinuousTileStops(scheme, lyr);
      assert.deepEqual(stops.map(function(s) { return s.value; }), [-40, -12.5, 15, 42.5, 70]);
      assert.equal(stops[0].min, true);
      assert.equal(stops[4].max, true);
    });

    it('a diverging side has a tile more than its classes, and no pivot class by default', function() {
      var lyr = makeTestLayer();
      var scheme = diverging(lyr);
      var layout = scheme.layout;
      var k = Math.max(layout.below, layout.above) + 1;
      assert.equal(layout.neutral, null);
      assert.equal(getSchemeTiles(scheme).length, k * 2 + 1);
      var use = getDivergingTileUse(scheme);
      assert.equal(use.filter(Boolean).length, layout.below + layout.above + 2);
      assert.equal(use[k], false);
    });

    it('classed and continuous schemes each keep their pivot class setting', function() {
      var lyr = makeTestLayer();
      var scheme = setSchemeNeutral(diverging(lyr), true);
      assert.equal(getSchemeNeutral(scheme), true);
      var classed = setSchemeContinuous(scheme, false);
      assert.equal(getSchemeNeutral(classed), true);
      classed = setSchemeNeutral(classed, false);
      assert.equal(getSchemeNeutral(setSchemeContinuous(classed, true)), true);
      assert.equal(getSchemeNeutral(setSchemeContinuous(classed, false)), false);
    });

    it('diverging gradients: one per side, and one for a pivot class', function() {
      var lyr = makeTestLayer();
      var scheme = diverging(lyr);
      var k = getCenterTile(scheme);
      var segments = getContinuousSegments(scheme);
      assert.equal(segments.length, 2);
      assert.equal(segments[0].end, k - 1);
      assert.equal(segments[1].start, k + 1);
      assert.equal(segments[0].samples[0].pos, segments[0].start);
      scheme = updateDivergingLayout(setSchemeNeutral(scheme, true), lyr);
      k = getCenterTile(scheme);
      segments = getContinuousSegments(scheme);
      assert.equal(segments.length, 3);
      assert.deepEqual([segments[1].start, segments[1].end], [k, k]);
    });

    it('an equal-interval shorter side ends where its data ends, between two stops', function() {
      var lyr = makeTestLayer();
      var scheme = diverging(lyr, function(s) { return Object.assign(s, {method: 'equal-interval'}); });
      var low = getContinuousSegments(scheme)[0];
      assert.equal(low.flatStart, false);
      assert(low.start > Math.floor(low.start));
      assert.equal(getContinuousSegments(scheme)[1].flatEnd, true);
    });

    it('the command', function() {
      var lyr = makeTestLayer();
      var seq = setSchemeContinuous(getDefaultScheme('change'), true);
      assert.equal(formatSchemeCommand(seq, ['#000000', '#ffffff']),
        "-classify field='change' method=quantile classes=4 continuous interpolation=oklch colors=#000000,#ffffff");
      assert.equal(formatSchemeCommand(diverging(lyr), ['#000000']),
        "-classify field='change' method=quantile pivot=auto classes=7 no-pivot-class continuous interpolation=oklch colors=#000000");
      assert.equal(formatSchemeCommand(setSchemeNeutral(diverging(lyr), true), ['#000000']),
        "-classify field='change' method=quantile pivot=auto classes=7 pivot-class continuous interpolation=oklch colors=#000000");
    });

    it('the command colors the features as the tiles show them', async function() {
      var lyr = makeTestLayer();
      var schemes = [
        setSchemeContinuous(getDefaultScheme('change'), true),
        Object.assign(setSchemeContinuous(setSchemeVibrance(getDefaultScheme('change'), 0.05), true), {method: 'equal-interval'}),
        diverging(lyr),
        diverging(lyr, function(s) { return setSchemeNeutral(s, true); }),
        diverging(lyr, function(s) { return setSchemeSplit(s, 'count'); }),
        diverging(lyr, function(s) { return Object.assign(s, {method: 'equal-interval'}); }),
        diverging(lyr, function(s) { return setTileColor(Object.assign(s, {method: 'nice'}), 0, '#000000'); })
      ];
      for (var scheme of schemes) {
        scheme = updateDivergingLayout(scheme, lyr);
        var cmd = formatSchemeCommand(scheme, getAppliedColors(scheme));
        var out = await api.applyCommands('-i data.json ' + cmd + ' -o', {'data.json': lyr.data.getRecords()});
        var fills = JSON.parse(out['data.json']).map(function(d) { return hex(d.fill); });
        var expected = values.map(function(v) { return getExpectedFill(scheme, lyr, v); });
        assert.deepEqual(fills, expected, cmd);
      }
    });

    it('the layer record checks a fingerprint of the fills', function() {
      var lyr = makeLayer([{change: 1, fill: 'rgb(1, 2, 3)'}, {change: 2, fill: 'rgb(4, 5, 6)'}]);
      var scheme = setSchemeContinuous(getDefaultScheme('change'), true);
      setLayerScheme(lyr, getAppliedScheme(scheme, getSchemeColors(scheme), lyr));
      assert(getLayerScheme(lyr));
      assert.equal(getFillFingerprint(lyr), getLayerScheme(lyr).fillHash);
      lyr.data.getRecords()[1].fill = 'rgb(4, 5, 7)';
      assert.equal(getLayerScheme(lyr), null);
    });

    it('the command colors the features by custom breaks as the tiles show them', async function() {
      var lyr = makeTestLayer();
      var seq = setSchemeContinuous(getDefaultScheme('change'), true);
      var schemes = [
        setSchemeBreak(seq, lyr, 1, 3),
        diverging(lyr, function(s) { return setSchemeBreak(updateDivergingLayout(s, lyr), lyr, 0, -25); }),
        diverging(lyr, function(s) {
          s = updateDivergingLayout(setSchemeNeutral(s, true), lyr);
          return setSchemeBreak(s, lyr, s.layout.breaks.indexOf(s.layout.neutral[1]), 8);
        })
      ];
      for (var scheme of schemes) {
        scheme = updateDivergingLayout(scheme, lyr);
        assert.equal(scheme.method, 'breaks');
        var cmd = formatSchemeCommand(scheme, getAppliedColors(scheme));
        var out = await api.applyCommands('-i data.json ' + cmd + ' -o', {'data.json': lyr.data.getRecords()});
        var fills = JSON.parse(out['data.json']).map(function(d) { return hex(d.fill); });
        var expected = values.map(function(v) { return getExpectedFill(scheme, lyr, v); });
        assert.deepEqual(fills, expected, cmd);
      }
    });
  });

  describe('custom breaks', function() {
    var values = [-40, -30, -20, -10, 5, 10, 20, 30, 40, 50, 60, 70];
    function makeTestLayer() {
      return makeLayer(values.map(function(v) { return {change: v, other: v * 2}; }));
    }
    function sequential(n) {
      return setTileCount(Object.assign(getDefaultScheme('change'), {method: 'equal-interval'}), n || 4);
    }

    it('the breaks start from the method\'s', function() {
      var lyr = makeTestLayer();
      var info = getSchemeBreaks(sequential(), lyr);
      assert.deepEqual(info.breaks, [-12.5, 15, 42.5]);
      assert.deepEqual(info.fixed, [false, false, false]);
      assert.equal(info.min, -40);
      assert.equal(info.max, 70);
    });

    it('moving a break makes the breaks custom', function() {
      var lyr = makeTestLayer();
      var scheme = setSchemeBreak(sequential(), lyr, 1, 20);
      assert.equal(scheme.method, 'breaks');
      assert.equal(scheme.baseMethod, 'equal-interval');
      assert.deepEqual(scheme.breaks, [-12.5, 20, 42.5]);
      assert.deepEqual(getSequentialClassRanges(scheme, lyr)[1], [-12.5, 20]);
      assert.equal(setSchemeBreak(scheme, lyr, 0, 0).baseMethod, 'equal-interval');
    });

    it('a break stays between its neighbors and the data range', function() {
      var lyr = makeTestLayer();
      assert.deepEqual(setSchemeBreak(sequential(), lyr, 1, 100).breaks, [-12.5, 42.5, 42.5]);
      assert.deepEqual(setSchemeBreak(sequential(), lyr, 0, -100).breaks, [-40, 15, 42.5]);
      assert.deepEqual(setSchemeBreak(sequential(), lyr, 2, 100).breaks, [-12.5, 15, 70]);
    });

    it('the command has the breaks', function() {
      var lyr = makeTestLayer();
      var scheme = setSchemeBreak(sequential(), lyr, 1, 20);
      assert.equal(formatSchemeCommand(scheme, ['#000000']),
        "-classify field='change' method=breaks breaks=-12.5,20,42.5 colors=#000000");
      scheme = setSchemeBreak(setSchemeContinuous(sequential(), true), lyr, 1, 20);
      assert.equal(formatSchemeCommand(scheme, ['#000000']),
        "-classify field='change' method=breaks breaks=-12.5,20,42.5 continuous interpolation=oklch colors=#000000");
    });

    it('a continuous scheme edits the stops between the min and the max', function() {
      var lyr = makeTestLayer();
      var scheme = setSchemeBreak(setSchemeContinuous(sequential(), true), lyr, 0, 0);
      var stops = getContinuousTileStops(scheme, lyr);
      assert.deepEqual(stops.map(function(s) { return s.value; }), [-40, 0, 15, 42.5, 70]);
    });

    it('choosing a method, a field or classes vs continuous drops the custom breaks', function() {
      var lyr = makeTestLayer();
      var scheme = setSchemeBreak(sequential(), lyr, 1, 20);
      assert.equal(setSchemeMethod(scheme, 'quantile').method, 'quantile');
      assert.equal(setSchemeMethod(scheme, 'breaks'), scheme);
      assert.equal(setSchemeField(scheme, 'other').method, 'equal-interval');
      assert.equal(setSchemeField(scheme, 'change').method, 'breaks');
      assert.equal(setSchemeContinuous(scheme, true).method, 'equal-interval');
      assert.equal(setSchemeContinuous(scheme, true).breaks, null);
    });

    it('more colors split the classes with the most features, fewer merge the smallest', function() {
      var lyr = makeTestLayer();
      var scheme = Object.assign(sequential(2), {method: 'breaks', baseMethod: 'quantile', breaks: [-35]});
      // [-40] and [-35...]: the larger class splits at its median
      assert.deepEqual(setTileCount(scheme, 3, -1, lyr).breaks, [-35, 20]);
      scheme = Object.assign(sequential(4), {method: 'breaks', baseMethod: 'quantile', breaks: [-35, 0, 65]});
      // the classes have 1, 3, 7 and 1 features: the break between the first two goes
      assert.deepEqual(setTileCount(scheme, 3, -1, lyr).breaks, [0, 65]);
      // without the layer, the breaks go back to the method's
      assert.equal(setTileCount(scheme, 3, -1).method, 'quantile');
    });

    it('resizing stops when no class can be split', function() {
      assert.deepEqual(resizeBreaks([2], [1, 1, 2, 2], 2), null);
      assert.deepEqual(resizeBreaks([2], [1, 1, 2, 3], 2), [2, 3]);
    });

    describe('diverging', function() {
      function diverging(lyr, neutral) {
        var scheme = setSchemeNeutral(getDefaultSchemeOfType('diverging', lyr), neutral);
        return updateDivergingLayout(scheme, lyr);
      }

      it('the pivot is a fixed break without a pivot class', function() {
        var lyr = makeTestLayer();
        var scheme = diverging(lyr, false);
        var info = getSchemeBreaks(scheme, lyr);
        var k = info.breaks.indexOf(0);
        assert(k > -1);
        assert.equal(info.fixed[k], true);
        assert.equal(info.fixed.filter(Boolean).length, 1);
        assert.equal(setSchemeBreak(scheme, lyr, k, 3), scheme);
      });

      it('the edges of a pivot class stay on their sides of the pivot', function() {
        var lyr = makeTestLayer();
        var scheme = diverging(lyr, true);
        var info = getSchemeBreaks(scheme, lyr);
        var lo = info.breaks.indexOf(info.neutral[0]);
        var hi = info.breaks.indexOf(info.neutral[1]);
        assert.equal(info.fixed.filter(Boolean).length, 0);
        assert.deepEqual(setSchemeBreak(scheme, lyr, lo, -2).breaks[lo], -2);
        // the class can't lose the pivot
        assert.equal(setSchemeBreak(scheme, lyr, lo, 3), scheme);
        assert.equal(setSchemeBreak(scheme, lyr, hi, -5), scheme);
      });

      it('the command has the breaks and the pivot, and no classes=', function() {
        var lyr = makeTestLayer();
        var scheme = diverging(lyr, false);
        var info = getSchemeBreaks(scheme, lyr);
        scheme = updateDivergingLayout(setSchemeBreak(scheme, lyr, 0, -35), lyr);
        assert.equal(formatSchemeCommand(scheme, ['#000000']),
          "-classify field='change' method=breaks breaks=" + [-35].concat(info.breaks.slice(1)).join(',') +
          ' pivot=0 no-pivot-class colors=#000000');
        assert.equal(scheme.layout.below + scheme.layout.above, info.breaks.length + 1);
      });

      it('a new pivot or number of classes drops the custom breaks', function() {
        var lyr = makeTestLayer();
        var scheme = setSchemeBreak(diverging(lyr, false), lyr, 0, -35);
        assert.equal(setSchemePivot(scheme, 10).method, 'quantile');
        assert.equal(setSchemeNeutral(scheme, true).method, 'quantile');
        assert.equal(setTileCount(scheme, 9, -1, lyr).method, 'quantile');
      });
    });

    it('the classes between the breaks: their colors and numbers of features', function() {
      var lyr = makeTestLayer();
      var scheme = sequential();
      var breaks = getSchemeBreaks(scheme, lyr).breaks;
      assert.deepEqual(getBreakClassSwatches(scheme), getSchemeColors(scheme));
      assert.deepEqual(getBreakClassCounts(scheme, lyr, breaks), [3, 3, 3, 3]);
      // continuous: a gradient between the stops at the ends of each class
      scheme = setSchemeContinuous(sequential(), true);
      var colors = getSchemeColors(scheme);
      var swatches = getBreakClassSwatches(scheme);
      assert.equal(swatches.length, getSchemeBreaks(scheme, lyr).breaks.length + 1);
      assert.equal(swatches[0], 'linear-gradient(' + colors[0] + ', ' + colors[1] + ')');
    });

    it('diverging classes, classed or continuous, have one swatch each', function() {
      var lyr = makeTestLayer();
      [false, true].forEach(function(continuous) {
        [false, true].forEach(function(neutral) {
          var scheme = getDefaultSchemeOfType('diverging', lyr);
          scheme = setSchemeNeutral(setSchemeContinuous(scheme, continuous), neutral);
          scheme = updateDivergingLayout(scheme, lyr);
          var swatches = getBreakClassSwatches(scheme);
          assert.equal(swatches.length, scheme.layout.breaks.length + 1, continuous + ' ' + neutral);
          assert.equal(swatches.every(Boolean), true);
        });
      });
    });

    it('the roundest number in a range', function() {
      assert.equal(getRoundestNumber(12.34, 12.91), 12.6);
      assert.equal(getRoundestNumber(12.34, 13.2), 13);
      assert.equal(getRoundestNumber(-0.5, 0.2), 0);
      assert.equal(getRoundestNumber(-12.91, -12.34), -12.6);
      assert.equal(getRoundestNumber(1234, 1290), 1260);
      assert.equal(getRoundestNumber(0.0123, 0.0125), 0.0124);
      assert.equal(getRoundestNumber(7, 7), 7);
    });

    it('the histogram scale, linear or log', function() {
      var linear = getBreaksScale(0, 100, false);
      var log = getBreaksScale(1, 100, true);
      assert.equal(linear.toPos(25), 0.25);
      assert.equal(linear.toValue(0.25), 25);
      assert.equal(round3(log.toPos(10)), 0.5);
      assert.equal(round3(log.toValue(0.5)), 10);
      assert.equal(log.toPos(-1), 0);
      assert.equal(getBreaksScale(5, 5, false).toPos(5), 0.5);
      assert.deepEqual(getHistogram([0, 10, 49, 50, 100], linear, 2), [3, 2]);
    });
  });
});
