import assert from 'assert';
import {
  projectOntoPolyline, getDragPlacement, getPlacementValues, swapTextAnchor,
  parseOffsetPct, getStartOffsetPct, getDefaultOffsetPct, formatOffsetPct
} from '../src/gui/gui-label-path-drag';

// A straight line from (0,0) to (100,0), as a polyline.
var line = [[0, 0], [50, 0], [100, 0]];

describe('gui label path drag', function() {

  describe('projectOntoPolyline()', function() {
    it('reports position as a fraction of arc length', function() {
      assert.equal(projectOntoPolyline(line, [25, 10]).t, 0.25);
      assert.equal(projectOntoPolyline(line, [80, -3]).t, 0.8);
    });

    it('reports distance from the path', function() {
      assert.equal(projectOntoPolyline(line, [25, 10]).dist, 10);
    });

    it('reports opposite sides with opposite signs', function() {
      var above = projectOntoPolyline(line, [25, 10]).side;
      var below = projectOntoPolyline(line, [25, -10]).side;
      assert.equal(above, -below);
      assert.ok(above !== 0);
    });

    it('reports no side for a point on the path', function() {
      assert.equal(projectOntoPolyline(line, [25, 0]).side, 0);
    });

    it('clamps a point beyond either end', function() {
      assert.equal(projectOntoPolyline(line, [-40, 5]).t, 0);
      assert.equal(projectOntoPolyline(line, [140, 5]).t, 1);
    });

    it('measures along a bent path rather than across it', function() {
      var bent = [[0, 0], [0, 10], [10, 10]];
      assert.equal(projectOntoPolyline(bent, [0, 5]).t, 0.25);
      assert.equal(projectOntoPolyline(bent, [5, 10]).t, 0.75);
    });

    it('returns null when there is no path', function() {
      assert.equal(projectOntoPolyline([[1, 1]], [0, 0]), null);
      assert.equal(projectOntoPolyline([[1, 1], [1, 1]], [0, 0]), null);
      assert.equal(projectOntoPolyline(null, [0, 0]), null);
    });
  });

  describe('getDragPlacement()', function() {
    var start = {offset: 40, t: 0.5, side: 1};

    it('moves the offset with the pointer, not to it', function() {
      var o = getDragPlacement(start, {t: 0.7, side: 1});
      assert.equal(o.offset, 60);
      assert.equal(o.flipped, false);
    });

    it('clamps the offset to the ends of the path', function() {
      assert.equal(getDragPlacement(start, {t: 0, side: 1}).offset, 0);
      assert.equal(getDragPlacement(start, {t: 1, side: 1}).offset, 90);
      assert.equal(getDragPlacement({offset: 90, t: 0.1, side: 1},
        {t: 0.9, side: 1}).offset, 100);
    });

    it('flips when the pointer crosses the curve', function() {
      assert.equal(getDragPlacement(start, {t: 0.5, side: -1}).flipped, true);
    });

    it('does not flip on a pointer that is on the curve', function() {
      assert.equal(getDragPlacement(start, {t: 0.5, side: 0}).flipped, false);
      assert.equal(getDragPlacement({offset: 40, t: 0.5, side: 0},
        {t: 0.5, side: -1}).flipped, false);
    });
  });

  describe('getPlacementValues()', function() {
    it('writes the offset as a percentage', function() {
      assert.deepEqual(getPlacementValues({offset: 42.5, flipped: false}, ''),
        {offset: '42.5%', anchor: '', reversed: false});
    });

    it('measures a flipped offset from the other end', function() {
      assert.equal(getPlacementValues({offset: 30, flipped: true}, '').offset,
        '70%');
    });

    it('swaps the ends of text-anchor when flipping', function() {
      assert.equal(getPlacementValues({offset: 30, flipped: true}, 'start').anchor,
        'end');
      assert.equal(getPlacementValues({offset: 30, flipped: true}, 'end').anchor,
        'start');
      assert.equal(getPlacementValues({offset: 30, flipped: true}, 'middle').anchor,
        'middle');
    });

    it('leaves text-anchor alone when only sliding', function() {
      assert.equal(getPlacementValues({offset: 30, flipped: false}, 'start').anchor,
        'start');
    });

    it('puts a twice-flipped label back where it started', function() {
      var once = getPlacementValues({offset: 30, flipped: true}, 'start');
      var twice = getPlacementValues({
        offset: parseOffsetPct(once.offset), flipped: true
      }, once.anchor);
      assert.equal(twice.offset, '30%');
      assert.equal(twice.anchor, 'start');
    });
  });

  describe('swapTextAnchor()', function() {
    it('leaves a centred label as its own opposite', function() {
      assert.equal(swapTextAnchor(''), '');
      assert.equal(swapTextAnchor('middle'), 'middle');
    });
  });

  describe('parseOffsetPct()', function() {
    it('reads a percentage', function() {
      assert.equal(parseOffsetPct('42.5%'), 42.5);
      assert.equal(parseOffsetPct('0%'), 0);
      assert.equal(parseOffsetPct(' 30% '), 30);
    });

    it('clamps a percentage from outside the path', function() {
      assert.equal(parseOffsetPct('120%'), 100);
      assert.equal(parseOffsetPct('-5%'), 0);
    });

    it('refuses anything that is not a percentage', function() {
      assert.equal(parseOffsetPct('42'), null);
      assert.equal(parseOffsetPct(42), null);
      assert.equal(parseOffsetPct('10px'), null);
      assert.equal(parseOffsetPct(''), null);
      assert.equal(parseOffsetPct(undefined), null);
    });
  });

  describe('getStartOffsetPct()', function() {
    it('reads the offset the label carries', function() {
      assert.equal(getStartOffsetPct('30%', 'start', 80), 30);
    });

    it('falls back on text-anchor when the label has no offset', function() {
      // what the tool's own labels look like: placed, never slid
      assert.equal(getStartOffsetPct(undefined, '', 80), 50);
      assert.equal(getStartOffsetPct(undefined, 'start', 80), 0);
      assert.equal(getStartOffsetPct('', 'end', 80), 100);
    });

    it('falls back on the pointer for an offset it cannot read', function() {
      assert.equal(getStartOffsetPct('40', 'start', 80), 80);
      assert.equal(getStartOffsetPct('12px', '', 80), 80);
    });
  });

  describe('getDefaultOffsetPct()', function() {
    it('agrees with text-anchor', function() {
      assert.equal(getDefaultOffsetPct('start'), 0);
      assert.equal(getDefaultOffsetPct('end'), 100);
      assert.equal(getDefaultOffsetPct('middle'), 50);
      assert.equal(getDefaultOffsetPct(''), 50);
    });
  });

  describe('formatOffsetPct()', function() {
    it('trims the digits a drag produces', function() {
      assert.equal(formatOffsetPct(50), '50%');
      assert.equal(formatOffsetPct(33.333333), '33.33%');
      assert.equal(formatOffsetPct(10.5), '10.5%');
      assert.equal(formatOffsetPct(0), '0%');
    });
  });
});
