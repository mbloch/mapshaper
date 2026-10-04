import assert from 'assert';
import {
  getDefaultScheme, getSchemeColors, getPinnedTiles, choosePreset, makeSchemeCustom,
  setTileColor, clearTileColor, setTileCount, reverseScheme, formatSchemeCommand,
  getSequentialPresetNames, getNumericFields, setLayerScheme, getLayerScheme,
  getPresetColors, getSchemeVibrance, setSchemeVibrance, defaultVibrance, maxVibrance,
  getSchemeTiles, getTileEditColor, setSchemeLongHue
} from '../src/gui/gui-color-scheme-model';
import api from '../mapshaper.js';

var internal = api.internal;

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
      assert.equal(tiles[0].adjusted, false);
      assert(tiles.some(function(t) { return t.adjusted; }));
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
  });
});
