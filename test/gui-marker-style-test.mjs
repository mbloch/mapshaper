import api from '../mapshaper.js';
import assert from 'assert';
import {
  getMarkerTextFields, getMarkerTextStyle, getAddMarkerFields, getNextMarkerText,
  getBaselineEm, parseBaseline, getAddMarkerTextCommand, getRemoveMarkerTextCommand,
  groupRestyleOptions, getDefaultMarkerTextStyle, getMarkerIconSize,
  getAutoNumberStart
} from '../src/gui/gui-marker-style.mjs';
import { getIconStyle } from '../src/gui/gui-symbol-style.mjs';
import { getAddLabelCommand } from '../src/gui/gui-label-commands.mjs';

var svg = api.internal.svg;

function text(o) {
  return Object.assign(getDefaultMarkerTextStyle(), {font: 'Arial'}, o);
}

async function run(cmd) {
  var out = await api.applyCommands(cmd + ' -o format=geojson out.json', {});
  return JSON.parse(out['out.json']).features.map(function(f) { return f.properties; });
}

describe('gui-marker-style.mjs', function () {
  describe('getNextMarkerText()', function () {
    it('counts up numbers and letters', function () {
      assert.equal(getNextMarkerText('1'), '2');
      assert.equal(getNextMarkerText('9'), '10');
      assert.equal(getNextMarkerText('A'), 'B');
      assert.equal(getNextMarkerText('c'), 'd');
    });

    it('repeats anything else, and a Z', function () {
      assert.equal(getNextMarkerText('Z'), 'Z');
      assert.equal(getNextMarkerText('A1'), 'A1');
      assert.equal(getNextMarkerText('★'), '★');
    });
  });

  describe('getAutoNumberStart()', function () {
    it('keeps text no marker has yet', function () {
      assert.equal(getAutoNumberStart('1', []), '1');
      assert.equal(getAutoNumberStart('4', ['1', '2']), '4');
    });

    it('moves on from text a marker has, to the next that none has', function () {
      assert.equal(getAutoNumberStart('1', ['1']), '2');
      assert.equal(getAutoNumberStart('1', ['1', '2', '3']), '4');
      assert.equal(getAutoNumberStart('B', ['A', 'B']), 'C');
    });

    it('stops at text that does not count up', function () {
      assert.equal(getAutoNumberStart('Z', ['Z']), 'Z');
      assert.equal(getAutoNumberStart('A1', ['A1']), 'A1');
    });
  });

  describe('getMarkerIconSize()', function () {
    it('grows a symbol too small for text, and leaves one with room', function () {
      assert.equal(getMarkerIconSize(10), 20);
      assert.equal(getMarkerIconSize(15), 20);
      assert.equal(getMarkerIconSize(16), 16);
      assert.equal(getMarkerIconSize(40), 40);
    });
  });

  describe('the baseline', function () {
    it('is stored in em of the font size', function () {
      assert.equal(getBaselineEm(6, 12), '0.5em');
      assert.equal(getBaselineEm(-1, 12), '-0.083em');
    });

    it('is shown in px, from em or px', function () {
      assert.equal(parseBaseline('0.5em', 12), 6);
      assert.equal(parseBaseline(4, 12), 4);
      assert.equal(parseBaseline('4px', 12), 4);
      assert.equal(parseBaseline('', 12), '');
      assert.equal(parseBaseline(undefined, 12), '');
      assert.equal(parseBaseline('1ex', 12), '');
    });
  });

  describe('getMarkerTextFields()', function () {
    it('leaves a regular face and an automatic baseline unset', function () {
      assert.deepEqual(getMarkerTextFields(text({style: 'normal', weight: '400'})), {
        'label-pos': 'c', 'font-family': 'Arial', 'font-size': 12, fill: '#ffffff'
      });
    });

    it('writes a face and a baseline', function () {
      assert.deepEqual(getMarkerTextFields(text({baseline: 6})), {
        'label-pos': 'c', 'font-family': 'Arial', 'font-size': 12,
        'font-style': 'normal', 'font-weight': '700', fill: '#ffffff', dy: '0.5em'
      });
    });

    it('reads back as the style it was written from', function () {
      var t = text({text: '3', baseline: 6, color: '#cccccc'});
      var rec = Object.assign({'label-text': '3'}, getMarkerTextFields(t));
      assert.deepEqual(getMarkerTextStyle(rec), {text: '3', font: 'Arial',
        style: 'normal', weight: '700', size: 12, color: '#cccccc', baseline: 6});
    });
  });

  describe('placing a marker', function () {
    it('is one -labels command that makes a marker', async function () {
      var icon = {shape: 'square', size: 20, fill: '#cc0000', stroke: '', strokeWidth: 0, rotation: 0};
      var cmd = getAddLabelCommand([[0, 0]], {
        target: {mode: 'new', newLayerName: 'symbols'},
        text: '1',
        style: getAddMarkerFields(icon, text())
      });
      var recs = await run(cmd);
      assert(svg.featureIsMarker(recs[0]));
      assert.equal(recs[0].icon, 'square');
      assert.equal(recs[0]['icon-size'], 20);
      assert.equal(recs[0]['icon-fill'], '#cc0000');
      assert.equal(recs[0].fill, '#ffffff');
      assert.equal(recs[0]['icon-stroke'], undefined);
    });
  });

  describe('adding and removing text', function () {
    var base = '-symbols coordinates=0,0 type=circle radius=6 fill=#123456 ' +
      'stroke=#000000 stroke-width=1 name=pts ' +
      '-symbols coordinates=1,1 type=square radius=10 fill=#00aa00 target=pts';

    async function records() {
      return run(base);
    }

    it('makes circles and squares markers, keeping their colors and sizes', async function () {
      var recs = await records();
      var groups = groupRestyleOptions(recs, [0, 1], getIconStyle);
      var cmd = base + ' ' + getAddMarkerTextCommand(text({text: '7'}), groups, [0]);
      var out = await run(cmd);
      assert(svg.featureIsMarker(out[0]));
      assert(svg.featureIsMarker(out[1]));
      assert.equal(out[0]['label-text'], '7');
      assert.equal(out[0].icon, 'circle');
      assert.equal(out[0]['icon-size'], 12);
      assert.equal(out[0]['icon-fill'], '#123456');
      assert.equal(out[0]['icon-stroke'], '#000000');
      assert.equal(out[0].fill, '#ffffff');
      // the circle's stroke would outline the text
      assert.equal(out[0].stroke, undefined);
      assert.equal(out[0].r, undefined);
      assert.equal(out[1].icon, 'square');
      assert.equal(out[1]['icon-fill'], '#00aa00');
    });

    it('taking the text off leaves the symbols as they were', async function () {
      var recs = await records();
      var add = getAddMarkerTextCommand(text({text: '7'}),
        groupRestyleOptions(recs, [0, 1], getIconStyle), [0]);
      var marked = await run(base + ' ' + add);
      var remove = getRemoveMarkerTextCommand(groupRestyleOptions(marked, [0, 1], getIconStyle));
      var out = await run(base + ' ' + add + ' ' + remove);
      assert(!svg.featureIsLabel(out[0]));
      assert(!svg.featureIsLabel(out[1]));
      assert.equal(out[0].r, 6);
      assert.equal(out[0].fill, '#123456');
      assert.equal(out[1].icon, 'square');
      assert.equal(out[1]['icon-fill'], '#00aa00');
      ['label-pos', 'font-family', 'font-size', 'font-weight'].forEach(function(name) {
        assert.equal(out[0][name], undefined, name);
        assert.equal(out[1][name], undefined, name);
      });
    });
  });
});
