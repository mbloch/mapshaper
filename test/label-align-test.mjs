import api from '../mapshaper.js';
import { renderLabel, getDrawnLabelOffset } from '../src/svg/svg-labels.mjs';
import { parseLabelAlign, getAlignmentAnchor, getAlignmentShift,
  getMeasuredTextWidth } from '../src/svg/svg-label-align.mjs';
import { setTextMeasureFunction,
  clearTextWidthCache } from '../src/svg/svg-label-metrics.mjs';
import { getLabelPositionAnchor } from '../src/svg/svg-properties.mjs';
import assert from 'assert';

// A string, not an object: applyCommands() styles the records of an object
// input in place, so a shared fixture would arrive at the second test carrying
// the first test's label-align.
var POINT = JSON.stringify({
  type: 'Feature',
  properties: {'label-text': 'North\nDakota'},
  geometry: {type: 'Point', coordinates: [0, 0]}
});

// What a measurement comes back with, for the test in hand. Only the GUI can
// really measure text, so these tests stand in for it -- a width in px at the
// label's own font size, for the widest of its lines.
var measuredWidth = 0;

// A label whose text measures @width px, or 80 by default.
function measured(rec, width) {
  measuredWidth = width === undefined ? 80 : width;
  return Object.assign({'label-text': 'North\nDakota', 'font-size': 12}, rec);
}

function measuringNothing() {
  setTextMeasureFunction(null);
  clearTextWidthCache();
}

function measuringWhateverTheTestSaid() {
  setTextMeasureFunction(function() { return measuredWidth; });
  clearTextWidthCache();
}

function x(rec) {
  return renderLabel(rec).properties.x;
}

describe('label-align', function () {

  describe('parsing', function () {
    it('takes left, center and right, in any case, and nothing else', function () {
      assert.equal(parseLabelAlign('left'), 'left');
      assert.equal(parseLabelAlign(' Center '), 'center');
      assert.equal(parseLabelAlign('RIGHT'), 'right');
      assert.strictEqual(parseLabelAlign('middle'), null);
      assert.strictEqual(parseLabelAlign('start'), null);
      assert.strictEqual(parseLabelAlign(''), null);
    });

    it('resolves to the text-anchor it is rendered as', function () {
      assert.equal(getAlignmentAnchor('left'), 'start');
      assert.equal(getAlignmentAnchor('center'), 'middle');
      assert.equal(getAlignmentAnchor('right'), 'end');
      assert.strictEqual(getAlignmentAnchor('sideways'), null);
      assert.strictEqual(getAlignmentAnchor(undefined), null);
    });

    it('-style rejects a value that is not one of the three', async function () {
      await assert.rejects(api.applyCommands(
        '-i point.json -style label-align=middle -o out.json', {'point.json': POINT}));
    });

    it('-style with an empty value unsets it', async function () {
      var out = await api.applyCommands(
        '-i point.json -style label-align=right -style label-align= -o out.json',
        {'point.json': POINT});
      var rec = JSON.parse(out['out.json']).features[0].properties;
      assert.ok(!('label-align' in rec) || rec['label-align'] === undefined);
    });

    it('-add-label takes it, and rejects a value that is not one of the three', async function () {
      var out = await api.applyCommands(
        '-i point.json -add-label coordinates=0,0 text=Reno label-align=left -o out.json',
        {'point.json': POINT});
      var records = JSON.parse(out['out.json']).features.map(function(f) {
        return f.properties;
      });
      assert.equal(records[records.length - 1]['label-align'], 'left');
      await assert.rejects(api.applyCommands(
        '-i point.json -add-label coordinates=0,0 text=Reno label-align=justified -o out.json',
        {'point.json': POINT}));
    });
  });

  describe('the anchor a position implies', function () {
    it('is where the block of text sits, whatever the lines inside it do', function () {
      assert.equal(getLabelPositionAnchor({'label-pos': 'n'}), 'middle');
      assert.equal(getLabelPositionAnchor({'label-pos': 'c'}), 'middle');
      assert.equal(getLabelPositionAnchor({'label-pos': 'e'}), 'start');
      assert.equal(getLabelPositionAnchor({'label-pos': 'ne'}), 'start');
      assert.equal(getLabelPositionAnchor({'label-pos': 'w'}), 'end');
      assert.equal(getLabelPositionAnchor({'label-pos': 'sw'}), 'end');
    });

    it('is the SVG default for a label with no position, and for a bad one', function () {
      assert.equal(getLabelPositionAnchor({}), 'start');
      assert.equal(getLabelPositionAnchor({'label-pos': 'nne'}), 'start');
      assert.equal(getLabelPositionAnchor(null), 'start');
    });

    it('is not read from a text-anchor of the record\'s own', function () {
      // that is the value label-align replaces, so it cannot also be the
      // record of where the block belongs
      assert.equal(getLabelPositionAnchor({'text-anchor': 'end'}), 'start');
    });
  });

  describe('holding the block still', function () {
    beforeEach(measuringWhateverTheTestSaid);
    afterEach(measuringNothing);

    it('left-aligns the lines of a centred label without moving them', function () {
      // The block is centred on the anchor, so its left edge is half a width
      // to the left; anchoring the lines there individually puts x in the
      // same place.
      var rec = measured({'label-pos': 'n', 'label-align': 'left'});
      var o = renderLabel(rec);
      assert.equal(o.properties.x, -40);
      assert.equal(o.properties['text-anchor'], undefined); // an attribute, not a property here
      assert.equal(o.children[0].properties.x, -40); // and every line with it
    });

    it('right-aligns them without moving them either', function () {
      var rec = measured({'label-pos': 'n', 'label-align': 'right'});
      assert.equal(x(rec), 40);
    });

    it('centres the lines of a label hung off to the east', function () {
      // east means the block starts at the anchor, 0.4em clear of it; centring
      // the lines has to add half a width to keep that edge where it was
      var rec = measured({'label-pos': 'ne', 'label-align': 'center', 'font-size': 10});
      assert.equal(x(rec), 4 + 40);
    });

    it('holds the six positions whose offset is in ems', function () {
      // The em offsets are what hold text clear of its anchor, so these are
      // the positions where a label is most obviously misplaced by a shift --
      // and they were the ones going uncorrected, because the conversion
      // needed a font size the record does not usually carry.
      var offsets = {e: 0.45, w: -0.45, ne: 0.4, se: 0.4, nw: -0.4, sw: -0.4};
      var anchors = {e: 0, w: 1, ne: 0, se: 0, nw: 1, sw: 1};
      Object.keys(offsets).forEach(function(pos) {
        var rec = measured({'label-pos': pos, 'label-align': 'center'});
        // 12 is the size a label with none of its own is drawn at
        var dx = offsets[pos] * 12;
        var shift = (0.5 - anchors[pos]) * 80;
        assert.equal(x(rec), Math.round((dx + shift) * 10) / 10, pos);
      });
    });

    it('resolves an em offset against the label\'s own size when it has one', function () {
      var rec = measured({'label-pos': 'e', 'label-align': 'center', 'font-size': 20});
      assert.equal(x(rec), 9 + 40);
    });

    it('does nothing when the alignment is the one the position implies', function () {
      var rec = measured({'label-pos': 'n', 'label-align': 'center'});
      assert.equal(x(rec), '0'); // the position's own dx, untouched
    });

    it('holds a label that has a dx of its own, in px', function () {
      var rec = measured({'label-pos': 'n', dx: 6, 'label-align': 'left'});
      assert.equal(x(rec), -34);
    });

    it('rounds to a tenth of a pixel', function () {
      var rec = measured({'label-pos': 'ne', 'label-align': 'center', 'font-size': 12}, 33.333);
      assert.equal(x(rec), 21.5); // 4.8 + 16.6665
    });

    it('leaves a dx in units it cannot add pixels to alone', function () {
      var rec = measured({dx: '2pt', 'label-align': 'center'});
      assert.equal(x(rec), '2pt');
    });

    it('leaves an em dx alone when the font size is unreadable', function () {
      // an absent size is the normal case and resolves against the default; a
      // size that is neither a number nor absent is not something to guess at
      var rec = measured({dx: '0.4em', 'label-align': 'center', 'font-size': 'larger'});
      assert.equal(x(rec), '0.4em');
    });
  });

  describe('when there is no measurement to work from', function () {
    beforeEach(measuringNothing);

    it('still aligns the lines, and the block moves as it did before', function () {
      // which is what a label authored outside the GUI does, since nothing
      // there can measure text
      var rec = {'label-text': 'North\nDakota', 'label-pos': 'n',
        'label-align': 'left'};
      assert.equal(x(rec), '0');
      assert.equal(getAlignmentShift(rec, 'middle'), 0);
    });

    it('ignores a measurement of zero or less', function () {
      setTextMeasureFunction(function() { return 0; });
      assert.strictEqual(getMeasuredTextWidth(measured({})), null);
      clearTextWidthCache();
      setTextMeasureFunction(function() { return -10; });
      assert.strictEqual(getMeasuredTextWidth(measured({})), null);
    });
  });

  describe('export', function () {
    var LABEL = '-i point.json ';

    // Export measures nothing on its own, so the GUI's part is played here.
    // Note the measure function goes on the module the *bundle* uses, which is
    // not the one this file imports from src/.
    beforeEach(function () {
      api.internal.svg.setTextMeasureFunction(function () { return 80; });
      api.internal.svg.clearTextWidthCache();
    });

    afterEach(function () {
      api.internal.svg.setTextMeasureFunction(null);
      api.internal.svg.clearTextWidthCache();
    });

    async function svg(cmd) {
      var out = await api.applyCommands(cmd + ' -o out.svg width=400',
        {'point.json': POINT});
      return String(out['out.svg']);
    }

    it('writes the corrected x and the alignment as text-anchor', async function () {
      var str = await svg(LABEL + '-style label-pos=n label-align=left ' +
        'font-size=12');
      assert.ok(/text-anchor="start"/.test(str), str);
      assert.ok(/x="-40"/.test(str), str);
    });

    it('leaves a label with no alignment exactly as it was', async function () {
      var str = await svg(LABEL + '-style label-pos=n font-size=12');
      assert.ok(/text-anchor="middle"/.test(str), str);
      assert.ok(/x="0"/.test(str), str);
    });

    it('does not write label-align as an attribute', async function () {
      var str = await svg(LABEL + '-style label-pos=n label-align=left ' +
        'font-size=12');
      assert.ok(!/label-align/.test(str), str);
    });
  });

  // What the GUI's Draggable mode starts a drag from: the same numbers the
  // renderer above draws with, which is why it lives beside it rather than in
  // the tool.
  describe('getDrawnLabelOffset()', function () {
    beforeEach(measuringWhateverTheTestSaid);
    afterEach(measuringNothing);

    it('resolves a position into px against the label\'s font size', function () {
      var o = getDrawnLabelOffset({'label-pos': 'e', 'font-size': 20});
      assert.equal(o.dx, 9); // 0.45em
      // unrounded: a resolved measurement, which the drag rounds when it
      // writes one
      assert.ok(Math.abs(o.dy - 4.6) < 1e-9, o.dy); // 0.23em
      assert.equal(o['text-anchor'], 'start');
    });

    it('resolves em offsets against the default size when there is none', function () {
      assert.equal(getDrawnLabelOffset({'label-pos': 'e'}).dx, 0.45 * 12);
    });

    it('takes the offsets a label carries over the ones its position implies', function () {
      var o = getDrawnLabelOffset({'label-pos': 'e', dx: 3, dy: 0});
      assert.equal(o.dx, 3);
      assert.equal(o.dy, 0);
      assert.equal(o['text-anchor'], 'start');
    });

    it('reports the offset and justification the label is drawn with', function () {
      // the alignment's correction is part of where the text is, so a drag
      // that started from dx alone would move it
      var rec = measured({'label-pos': 'n', 'label-align': 'left'});
      assert.equal(getDrawnLabelOffset(rec).dx, -40);
      assert.equal(getDrawnLabelOffset(rec)['text-anchor'], 'start');
    });

    it('reads an offset in units it cannot convert as zero', function () {
      assert.equal(getDrawnLabelOffset({dx: '50%'}).dx, 0);
    });

    it('reports nothing for a label with no offsets at all', function () {
      var o = getDrawnLabelOffset({'label-text': 'Reno'});
      assert.equal(o.dx, 0);
      assert.equal(o.dy, 0);
      assert.equal(o['text-anchor'], '');
    });
  });
});
