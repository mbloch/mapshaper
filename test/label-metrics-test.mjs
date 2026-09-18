import { getMeasuredTextWidth, setTextMeasureFunction, clearTextWidthCache,
  getTextWidthCacheSize } from '../src/svg/svg-label-metrics.mjs';
import { getLabelFitState } from '../src/svg/svg-label-fit.mjs';
import { renderLabel } from '../src/svg/svg-labels.mjs';
import assert from 'assert';

// Stands in for the GUI's offscreen renderer: a width per character, so that
// a test can predict what a measurement should come back as.
function fakeMeasurer(calls) {
  return function(rec) {
    var text = String(rec['label-text'] || '');
    var lines = text.split('\n');
    var widest = 0;
    calls.push(rec);
    lines.forEach(function(line) {
      widest = Math.max(widest, line.length * 10);
    });
    return widest || null;
  };
}

describe('label text metrics', function () {

  // The measure function is module state, so it outlives the file that set it:
  // these tests start from nothing measurable whatever ran before them, and
  // leave that state behind for whatever runs next.
  beforeEach(measuringNothing);
  afterEach(measuringNothing);

  function measuringNothing() {
    setTextMeasureFunction(null);
    clearTextWidthCache();
  }

  it('has no width with nothing to measure with, which is the CLI\'s normal state', function () {
    assert.strictEqual(getMeasuredTextWidth({'label-text': 'Reno'}), null);
  });

  describe('measuring on demand', function () {
    it('asks once for a given text and font, and remembers the answer', function () {
      var calls = [];
      setTextMeasureFunction(fakeMeasurer(calls));
      assert.equal(getMeasuredTextWidth({'label-text': 'Reno'}), 40);
      assert.equal(getMeasuredTextWidth({'label-text': 'Reno'}), 40);
      assert.equal(calls.length, 1);
    });

    it('measures the widest line of a multi-line label', function () {
      setTextMeasureFunction(fakeMeasurer([]));
      assert.equal(getMeasuredTextWidth({'label-text': 'North\nDakota'}), 60);
    });

    it('asks again when the text changes, without invalidating anything', function () {
      var calls = [];
      setTextMeasureFunction(fakeMeasurer(calls));
      getMeasuredTextWidth({'label-text': 'Reno'});
      assert.equal(getMeasuredTextWidth({'label-text': 'Sparks'}), 60);
      assert.equal(calls.length, 2);
      // and the first answer is still there to be found
      assert.equal(getMeasuredTextWidth({'label-text': 'Reno'}), 40);
      assert.equal(calls.length, 2);
    });

    it('asks again when a font property changes', function () {
      var calls = [];
      setTextMeasureFunction(fakeMeasurer(calls));
      getMeasuredTextWidth({'label-text': 'Reno'});
      getMeasuredTextWidth({'label-text': 'Reno', 'font-size': 24});
      getMeasuredTextWidth({'label-text': 'Reno', 'font-weight': 'bold'});
      getMeasuredTextWidth({'label-text': 'Reno', 'letter-spacing': 2});
      assert.equal(calls.length, 4);
    });

    it('does not ask about a property the width cannot depend on', function () {
      var calls = [];
      setTextMeasureFunction(fakeMeasurer(calls));
      getMeasuredTextWidth({'label-text': 'Reno'});
      getMeasuredTextWidth({'label-text': 'Reno', fill: 'red', 'label-pos': 'n'});
      assert.equal(calls.length, 1);
    });

    it('remembers a failure to measure, so it is not retried forever', function () {
      var calls = [];
      setTextMeasureFunction(function(rec) {
        calls.push(rec);
        return null;
      });
      assert.strictEqual(getMeasuredTextWidth({'label-text': 'Reno'}), null);
      assert.strictEqual(getMeasuredTextWidth({'label-text': 'Reno'}), null);
      assert.equal(calls.length, 1);
    });

    it('survives a measure function that throws', function () {
      setTextMeasureFunction(function() { throw new Error('no document'); });
      assert.strictEqual(getMeasuredTextWidth({'label-text': 'Reno'}), null);
    });

    it('refuses to measure while measuring', function () {
      // a measurement is itself a render, and rendering an aligned label reads
      // a width -- without a guard that is a measurement to take a measurement
      var depth = 0;
      var inner = 'unset';
      setTextMeasureFunction(function(rec) {
        depth++;
        if (depth == 1) {
          inner = getMeasuredTextWidth({'label-text': 'Elko'});
        }
        return 50;
      });
      assert.equal(getMeasuredTextWidth({'label-text': 'Reno'}), 50);
      assert.strictEqual(inner, null);
      assert.equal(depth, 1);
    });

    it('does not measure a label with no text', function () {
      var calls = [];
      setTextMeasureFunction(fakeMeasurer(calls));
      assert.strictEqual(getMeasuredTextWidth({'label-text': ''}), null);
      assert.strictEqual(getMeasuredTextWidth({}), null);
      assert.equal(calls.length, 0);
    });

    it('keeps nothing once the cache is cleared', function () {
      setTextMeasureFunction(fakeMeasurer([]));
      getMeasuredTextWidth({'label-text': 'Reno'});
      assert.equal(getTextWidthCacheSize(), 1);
      clearTextWidthCache();
      assert.equal(getTextWidthCacheSize(), 0);
    });
  });

  describe('what reads it', function () {
    it('label-align holds a block still with a measured width and no data', function () {
      var rec = {'label-text': 'North\nDakota', 'label-pos': 'n',
        'label-align': 'left'};
      assert.equal(renderLabel(rec).properties.x, '0');
      setTextMeasureFunction(fakeMeasurer([]));
      // 60px wide, centred on the anchor, so its left edge is 30 to the left
      assert.equal(renderLabel(rec).properties.x, -30);
    });

    it('the path fit check measures rather than giving up', function () {
      var rec = {'label-text': 'Reno'};
      assert.equal(getLabelFitState(rec, 100), 'unmeasured');
      setTextMeasureFunction(fakeMeasurer([]));
      assert.equal(getLabelFitState(rec, 100), 'fits');
      assert.equal(getLabelFitState(rec, 30), 'overflow');
    });

    it('the fit check follows the text, with nothing to keep in step', function () {
      // the width of the old text is still in the cache and is not consulted,
      // because the new text is not what it is filed under
      var rec = {'label-text': 'Reno'};
      setTextMeasureFunction(fakeMeasurer([]));
      assert.equal(getLabelFitState(rec, 60), 'fits'); // 40px of text
      rec['label-text'] = 'Winnemucca';
      assert.equal(getLabelFitState(rec, 60), 'overflow'); // 100px of it
    });
  });
});
