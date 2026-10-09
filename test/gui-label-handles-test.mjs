import api from '../mapshaper.js';
import assert from 'assert';
import {
  getAnchoredLabelHandles, getLabelColumn, getLabelBoxColumn, getWidthHandlePadding,
  getDraggedWidth, snapCalloutVia,
  getAttachFraction, getDraggedGap, followCalloutVia, formatPointPair,
  MIN_LABEL_WIDTH
} from '../src/gui/gui-label-handles';
import { getLabelStyleCommand, getLabelOffsetCommand } from '../src/gui/gui-label-commands';

var internal = api.internal;

function near(a, b, msg) {
  assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + ' expected ' + b + ', got ' + a);
}

function nearPoint(p, q) {
  near(p[0], q[0], 'x');
  near(p[1], q[1], 'y');
}

describe('gui-label-handles.mjs', function () {

  describe('getLabelColumn()', function () {
    it('is null for point text', function () {
      assert.strictEqual(getLabelColumn({'label-text': 'a', dx: 10}), null);
    });

    it('runs from the anchor edge the text starts at', function () {
      assert.deepEqual(getLabelColumn({'label-width': 100, dx: 10, 'text-anchor': 'start'}),
        [10, 110]);
      assert.deepEqual(getLabelColumn({'label-width': 100, dx: 10, 'text-anchor': 'end'}),
        [-90, 10]);
    });

    it('is centred on the anchor of centred text, which is the default', function () {
      assert.deepEqual(getLabelColumn({'label-width': 100, dx: 10}), [-40, 60]);
    });
  });

  describe('getLabelBoxColumn()', function () {
    it('grows the column by the padding on each side', function () {
      assert.deepEqual(getLabelBoxColumn({'label-width': 100, dx: 10,
        'text-anchor': 'start', 'label-padding': '2 6 2 4'}), [6, 116]);
      assert.deepEqual(getLabelBoxColumn({'label-width': 100, dx: 10,
        'text-anchor': 'start'}), [10, 110]);
      assert.strictEqual(getLabelBoxColumn({'label-text': 'a', 'label-padding': 4}), null);
    });

    it('puts the width handle outside the padding, and a drag there leaves the width', function () {
      var rec = {'label-text': 'a', 'label-width': 100, dx: 10, dy: 0,
        'text-anchor': 'start', 'label-padding': '2 6'};
      var o = getAnchoredLabelHandles(rec, {x: 4, y: -12, width: 112, height: 16}, {padding: 3});
      var handle = o.handles.filter(function(h) { return h.kind == 'width'; })[0];
      assert.deepEqual(o.column, [4, 116]);
      nearPoint(handle.point, [119, 7]);
      assert.equal(getDraggedWidth('start', 10, handle.point[0],
        3 + getWidthHandlePadding(rec, 'start')), 100);
      assert.equal(getWidthHandlePadding({'label-padding': '1 2 3 4'}, 'end'), 4);
      assert.equal(getWidthHandlePadding({}, 'start'), 0);
    });
  });

  describe('getDraggedWidth()', function () {
    it('measures from the edge that stays put, less the handle\'s padding', function () {
      assert.equal(getDraggedWidth('start', 10, 113, 3), 100);
      assert.equal(getDraggedWidth('end', 10, -93, 3), 100);
    });

    it('grows centred text both ways', function () {
      assert.equal(getDraggedWidth('middle', 0, 53, 3), 100);
      assert.equal(getDraggedWidth('middle', 0, -53, 3), 100);
    });

    it('rounds to whole px and stops at a minimum', function () {
      assert.equal(getDraggedWidth('start', 0, 50.4, 0), 50);
      assert.equal(getDraggedWidth('start', 0, -40, 0), MIN_LABEL_WIDTH);
    });
  });

  describe('snapCalloutVia()', function () {
    it('snaps to the anchor\'s and the attachment point\'s lines', function () {
      assert.deepEqual(snapCalloutVia([2, 47], [60, 50], 4), [0, 50]);
      assert.deepEqual(snapCalloutVia([58, -3], [60, 50], 4), [60, 0]);
    });

    it('leaves a point that is not near either alone', function () {
      assert.deepEqual(snapCalloutVia([20, 20], [60, 50], 4), [20, 20]);
    });
  });

  describe('getAttachFraction()', function () {
    var box = {xmin: 0, xmax: 100, ymin: 0, ymax: 40, midline: 10};

    it('puts the point on the nearest edge', function () {
      assert.deepEqual(getAttachFraction(box, [30, -20], 0), [0.3, 0]);
      assert.deepEqual(getAttachFraction(box, [30, 38], 0), [0.3, 1]);
      assert.deepEqual(getAttachFraction(box, [140, 30], 0), [1, 0.75]);
      assert.deepEqual(getAttachFraction(box, [3, 20], 0), [0, 0.5]);
    });

    it('snaps to the middle and the ends of an edge', function () {
      assert.deepEqual(getAttachFraction(box, [52, -5], 4), [0.5, 0]);
      assert.deepEqual(getAttachFraction(box, [97, -5], 4), [1, 0]);
    });

    it('snaps a side to the first line\'s midline', function () {
      assert.deepEqual(getAttachFraction(box, [-5, 12], 4), [0, 0.25]);
    });
  });

  describe('getDraggedGap()', function () {
    it('is the distance from the anchor, in tenths', function () {
      assert.equal(getDraggedGap([3, 4]), 5);
      assert.equal(getDraggedGap([1, 1]), 1.4);
    });
  });

  describe('followCalloutVia()', function () {
    it('turns and scales a curve\'s via point with its text', function () {
      // the text swings from the right of the anchor to above it, twice as far
      nearPoint(followCalloutVia('curve', [50, -10], [100, 0], [0, -200]), [-20, -100]);
    });

    it('keeps an elbow\'s corner in proportion', function () {
      nearPoint(followCalloutVia('elbow', [30, -20], [60, -50], [120, -100]), [60, -40]);
    });

    it('keeps a leg level with the text level', function () {
      nearPoint(followCalloutVia('elbow', [30, -50], [60, -50], [90, -80]), [45, -80]);
    });

    it('moves a corner with text that started in line with the anchor', function () {
      nearPoint(followCalloutVia('elbow', [20, -30], [0.5, -50], [40.5, -100]), [60, -60]);
    });
  });

  describe('formatPointPair()', function () {
    it('writes tenths, and no negative zero', function () {
      assert.equal(formatPointPair([12.345, -0.01]), '12.3,0');
    });
  });

  describe('getAnchoredLabelHandles()', function () {
    var box = {x: 20, y: -45, width: 60, height: 20};

    it('gives point text with no callout no handles, and no column', function () {
      var o = getAnchoredLabelHandles({'label-text': 'a', 'text-anchor': 'start', dx: 20},
        box, {padding: 3});
      assert.deepEqual(o.handles, []);
      assert.strictEqual(o.column, null);
    });

    it('puts the width handle on the left of text that ends at its anchor', function () {
      var o = getAnchoredLabelHandles({'label-text': 'a', 'text-anchor': 'end', dx: 80,
        'label-width': 60}, box, {padding: 3});
      assert.deepEqual(o.handles[0].point, [17, -22]);
    });

    it('puts it on the column rather than the text of a text block', function () {
      var o = getAnchoredLabelHandles({'label-text': 'a', 'text-anchor': 'start', dx: 20,
        'label-width': 100}, box, {padding: 3});
      assert.deepEqual(o.column, [20, 120]);
      assert.deepEqual(o.handles[0].point, [123, -22]);
    });

    it('adds the callout\'s handles where the line is drawn', function () {
      var rec = {'label-text': 'a', 'text-anchor': 'start', dx: 40, dy: -40,
        callout: 'elbow', 'callout-gap': 8};
      var shape = internal.svg.getLabelCalloutShape(rec, 0);
      var o = getAnchoredLabelHandles(rec, box, {padding: 3, scale: 1});
      assert.deepEqual(o.handles.map(function(h) { return h.kind; }),
        ['via', 'attach', 'gap']);
      assert.deepEqual(o.handles[0].point, shape.via);
      assert.deepEqual(o.handles[1].point, shape.attach);
      assert.deepEqual(o.handles[2].point, shape.tip);
      near(Math.hypot(shape.tip[0], shape.tip[1]), 8);
    });

    it('leaves off the gap handle when it would sit on the anchor', function () {
      var rec = {'label-text': 'a', dx: 40, dy: -40, callout: 'line', 'callout-gap': 2};
      var kinds = getAnchoredLabelHandles(rec, box, {padding: 3, scale: 1})
        .handles.map(function(h) { return h.kind; });
      assert.deepEqual(kinds, ['attach']);
      kinds = getAnchoredLabelHandles(rec, box, {padding: 3, scale: 4})
        .handles.map(function(h) { return h.kind; });
      assert.deepEqual(kinds, ['attach', 'gap']);
    });
  });
});

describe('gui-label-commands.mjs handle commands', function () {
  it('getLabelStyleCommand() writes each value, and removes an empty one', function () {
    assert.equal(getLabelStyleCommand({'callout-via': '10,-5', 'callout-gap': ''}, 3,
      {target: 'labels'}),
    "-labels callout-via='10,-5' callout-gap= ids=3 target='labels'");
  });

  it('getLabelStyleCommand() adds rewrapped text as a second -labels', function () {
    assert.equal(getLabelStyleCommand({'label-width': 80}, 0, {text: 'Mount <wbr>Rainier'}),
      "-labels label-width='80' ids=0 -labels text='Mount <wbr>Rainier' ids=0");
  });

  it('getLabelOffsetCommand() carries a via point along with the offset', function () {
    assert.equal(getLabelOffsetCommand({dx: 5, dy: -10, anchor: 'start', via: '3,-8', id: 1}),
      "-labels dx=5 dy=-10 text-anchor=start label-pos= callout-via='3,-8' ids=1");
  });
});
