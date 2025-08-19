import Big from 'big.js';
import { debug } from '../utils/mapshaper-logging';

// Find the intersection point of two segments that cross each other,
// or return null if the segments do not cross.
// Assumes endpoint intersections have already been detected
export function findCrossIntersection_big(ax, ay, bx, by, cx, cy, dx, dy) {
  var ax_big = Big(ax);
  var ay_big = Big(ay);
  var bx_big = Big(bx);
  var by_big = Big(by);
  var cx_big = Big(cx);
  var cy_big = Big(cy);
  var dx_big = Big(dx);
  var dy_big = Big(dy);
  var v1x = bx_big.minus(ax_big);
  var v1y = by_big.minus(ay_big);
  var den_big = determinant2D_big(v1x, v1y, dx_big.minus(cx_big), dy_big.minus(cy_big));
  if (den_big.eq(0)) {
    debug('DIV0 error - should have been identified as collinear "touch" intersection.');
    // console.log("hit?", segmentHit_big(ax, ay, bx, by, cx, cy, dx, dy))
    // console.log('Seg 1', getSegFeature(ax, ay, bx, by, true))
    // console.log('Seg 2', getSegFeature(cx, cy, dx, dy, false))
    return null;
  }
  // perform division using regular math, which does not reduce overall
  // precision in test data (big.js division is very slow)
  // tests show identical result to:
  // var m_big = orient2D_big(cx_big, cy_big, dx_big, dy_big, ax_big, ay_big).div(den_big)
  var m = orient2D_big(cx_big, cy_big, dx_big, dy_big, ax_big,
    ay_big).toNumber() / den_big.toNumber();
  var m_big = Big(m);
  // console.log("big m:", m_big.toString())
  var x_big = ax_big.plus(m_big.times(v1x).round(16));
  var y_big = ay_big.plus(m_big.times(v1y).round(16));
  var p = [x_big.toNumber(), y_big.toNumber()];
  return p;
}

export function orient2D_big(ax, ay, bx, by, cx, cy) {
  var a = (ax.minus(cx)).times(by.minus(cy));
  var b = (ay.minus(cy)).times(bx.minus(cx));
  return a.minus(b);
}

export function orient2D_big2(ax, ay, bx, by, cx, cy) {
  return orient2D_big(Big(ax), Big(ay), Big(bx), Big(by), Big(cx), Big(cy));
}

export function segmentHit_big(ax, ay, bx, by, cx, cy, dx, dy) {
  return orient2D_big(ax, ay, bx, by, cx, cy).times(
      orient2D_big(ax, ay, bx, by, dx, dy)).lte(0) &&
      orient2D_big(cx, cy, dx, dy, ax, ay).times(
      orient2D_big(cx, cy, dx, dy, bx, by)).lte(0);
}

export function segmentHit_big2(ax, ay, bx, by, cx, cy, dx, dy) {
  return segmentHit_big(Big(ax), Big(ay), Big(bx), Big(by),
    Big(cx), Big(cy), Big(dx), Big(dy));
}

function determinant2D_big(a, b, c, d) {
  return a.times(d).minus(b.times(c));
}
