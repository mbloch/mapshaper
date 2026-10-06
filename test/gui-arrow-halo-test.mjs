import assert from 'assert';
import { traceGrownTriangle } from '../src/gui/gui-canvas';

// Records the calls traceGrownTriangle() makes
function getRecorder() {
  var calls = [];
  return {
    calls: calls,
    moveTo: function(x, y) { calls.push({type: 'moveTo', x, y}); },
    arc: function(x, y, r, a0, a1, ccw) { calls.push({type: 'arc', x, y, r, a0, a1, ccw}); },
    closePath: function() { calls.push({type: 'closePath'}); }
  };
}

// The signed sweep of an arc, in the direction it is drawn
function getSweep(arc) {
  var d = arc.a1 - arc.a0;
  if (arc.ccw) {
    while (d > 0) d -= Math.PI * 2;
  } else {
    while (d < 0) d += Math.PI * 2;
  }
  return d;
}

function pointInTriangle(q, p) {
  function side(a, b) {
    return (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
  }
  var s1 = side(p[0], p[1]), s2 = side(p[1], p[2]), s3 = side(p[2], p[0]);
  return s1 > 0 && s2 > 0 && s3 > 0 || s1 < 0 && s2 < 0 && s3 < 0;
}

describe('arrowhead halos', function() {
  [
    ['one winding', [[0, 0], [10, 0], [0, 10]]],
    ['the other winding', [[0, 0], [0, 10], [10, 0]]],
    ['an arrowhead', [[20, 5], [8, 0], [8, 10]]]
  ].forEach(function(test) {
    var name = test[0], tri = test[1];
    it('grows a triangle by the same distance all round (' + name + ')', function() {
      var ctx = getRecorder();
      var r = 2;
      var arcs, total;
      traceGrownTriangle(tri, r, ctx);
      arcs = ctx.calls.filter(function(c) { return c.type == 'arc'; });
      assert.equal(ctx.calls[0].type, 'moveTo');
      assert.equal(ctx.calls[ctx.calls.length - 1].type, 'closePath');
      assert.equal(arcs.length, 3);
      // the path starts where the first arc does, so nothing joins it to a
      // point drawn before it
      assert.ok(Math.abs(ctx.calls[0].x - (tri[0][0] + r * Math.cos(arcs[0].a0))) < 1e-9);
      assert.ok(Math.abs(ctx.calls[0].y - (tri[0][1] + r * Math.sin(arcs[0].a0))) < 1e-9);
      total = 0;
      arcs.forEach(function(arc, i) {
        var mid = (arc.a0 + getSweep(arc) / 2);
        assert.deepEqual([arc.x, arc.y], tri[i]);
        assert.equal(arc.r, r);
        // around the outside of the corner, the short way
        assert.ok(Math.abs(getSweep(arc)) < Math.PI);
        assert.ok(!pointInTriangle([arc.x + r * Math.cos(mid), arc.y + r * Math.sin(mid)], tri));
        // each arc ends on the normal the next one starts from
        assert.ok(Math.abs(arc.a1 - arcs[(i + 1) % 3].a0) < 1e-9);
        total += getSweep(arc);
      });
      // a convex outline turns once around
      assert.ok(Math.abs(Math.abs(total) - Math.PI * 2) < 1e-9);
    });
  });

  it('traces nothing for a triangle with no area', function() {
    var ctx = getRecorder();
    traceGrownTriangle([[0, 0], [5, 0], [10, 0]], 2, ctx);
    assert.deepEqual(ctx.calls, []);
  });
});
