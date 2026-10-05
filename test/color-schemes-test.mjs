import { wrapColors } from '../src/color/color-schemes';
import { crameriSequential } from '../src/color/crameri-schemes';
import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;

function sameColor(a, b) {
  assert.deepEqual(internal.parseColor(a), internal.parseColor(b));
}

describe('color-schemes.js', function () {
  describe('wrapColors()', function () {
    it('test 1', function () {
      var colors = ['black', 'white'];
      var output = wrapColors(colors, 3);
      assert.deepEqual(output, ['black', 'white', 'black']);
    })

    it('test 2', function () {
      var colors = ['black', 'white'];
      var output = wrapColors(colors, 4);
      assert.deepEqual(output, ['black', 'white', 'black', 'white']);
    })

    it('test 3', function () {
      var colors = ['black', 'white'];
      var output = wrapColors(colors, 5);
      assert.deepEqual(output, ['black', 'white', 'black', 'white', 'black']);
    })
  })

  describe('Crameri schemes', function () {
    it('ramps run through their stored stops', function () {
      var stops = crameriSequential.batlow;
      var ramp = internal.getColorRamp('batlow', 33);
      assert.equal(ramp.length, 33);
      sameColor(ramp[0], '#' + stops.slice(0, 6));
      sameColor(ramp[16], '#' + stops.slice(16 * 6, 17 * 6));
      sameColor(ramp[32], '#' + stops.slice(-6));
    })

    it('names are case-insensitive', function () {
      assert(internal.isColorSchemeName('Batlow'));
      assert.deepEqual(internal.getColorRamp('VIK', 5), internal.getColorRamp('vik', 5));
    })

    it('diverging maps have a light center', function () {
      ['bam', 'broc', 'cork', 'roma', 'vik'].forEach(function(name) {
        var rgb = internal.parseColor(internal.getColorRamp(name, 3)[1]);
        assert(rgb.r > 180 && rgb.g > 180 && rgb.b > 180, name);
      });
    })

    it('batlowS is a categorical scheme of 20 colors', function () {
      assert(internal.isCategoricalColorScheme('batlowS'));
      assert.equal(internal.getCategoricalColors('batlowS').length, 20);
    })

    it('-classify uses them', async function () {
      var csv = 'v\n-2\n0\n2';
      var out = await api.applyCommands('-i data.csv -classify v pivot=0 colors=vik -o format=json', {'data.csv': csv});
      var fills = JSON.parse(out['data.json']).map(d => d.fill);
      assert.equal(fills.length, 3);
      assert.equal(new Set(fills).size, 3);
    })
  })

  describe('getColorSchemeGroups()', function () {
    it('groups schemes by source', function () {
      var groups = internal.getColorSchemeGroups('diverging');
      assert.deepEqual(groups.map(g => g.source), ['NYT', 'ColorBrewer', 'Crameri']);
      assert(groups[1].names.includes('RdBu'));
      assert.deepEqual(groups[2].names, ['bam', 'broc', 'cork', 'roma', 'vik']);
    })

    it('combines types, and covers every scheme', function () {
      var types = ['categorical', 'sequential', 'rainbow', 'diverging'];
      var grouped = internal.getColorSchemeGroups(types).reduce((memo, g) => memo.concat(g.names), []);
      var all = types.reduce((memo, type) => memo.concat(internal.getColorSchemeNames(type)), []);
      assert.deepEqual(grouped.concat().sort(), all.concat().sort());
      assert.deepEqual(internal.getColorSchemeGroups(types).map(g => g.source),
        ['NYT', 'ColorBrewer', 'Tableau', 'Matplotlib', 'Crameri', 'd3']);
    })
  })

  describe('NYT schemes', function () {
    it('are sets of one size, which give their own colors at that size', function () {
      assert.equal(internal.getColorSchemeSetSize('nyt-blue3'), 3);
      assert.equal(internal.getColorSchemeSetSize('nyt-hot'), 5);
      assert.equal(internal.getColorSchemeSetSize('Blues'), 0);
      assert.deepEqual(internal.getColorRamp('nyt-blue3', 3).map(c => internal.formatColor(internal.parseColor(c))),
        ['#bfdff9', '#5189b8', '#315e82']);
      assert.equal(internal.getColorSchemeSetSize('nyt-drought'), 7);
      assert.equal(internal.isCenterlessColorScheme('nyt-heat'), true);
      assert.equal(internal.isCenterlessColorScheme('nyt-drought'), false);
      assert.deepEqual(internal.getCategoricalColors('nyt-7').length, 7);
      assert.equal(internal.getColorRamp('nyt-red4', 7).length, 7);
    })

    it('are not picked at random', function () {
      for (var i=0; i<200; i++) {
        assert(!/^nyt-/.test(internal.pickRandomColorScheme('sequential')));
      }
    })

    it('-classify takes their names', async function () {
      var csv = 'v\n1\n2\n3';
      var out = await api.applyCommands('-i data.csv -classify v classes=3 colors=nyt-blue3 -o format=json', {'data.csv': csv});
      var fills = JSON.parse(out['data.json']).map(d => internal.formatColor(internal.parseColor(d.fill)));
      assert.deepEqual(fills, ['#bfdff9', '#5189b8', '#315e82']);
    })
  })
})
