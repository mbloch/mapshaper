
import { distance2D } from '../geom/mapshaper-basic-geom';

// Source: https://diego.assencio.com/?index=8d6ca3d82151bad815f78addf9b5c1c6
export function twoCircleIntersection(c1, r1, c2, r2) {
  var d = distance2D(c1[0], c1[1], c2[0], c2[1]);
  if (d >= r1 + r2) return 0;
  var r1sq = r1 * r1,
      r2sq = r2 * r2,
      d1 = (r1sq - r2sq + d * d) / (2 * d),
      d2 = d - d1;
  if (d <= Math.abs(r1 - r2)) {
    return Math.PI * Math.min(r1sq, r2sq);
  }
  return r1sq * Math.acos(d1/r1) - d1 * Math.sqrt(r1sq - d1 * d1) +
    r2sq * Math.acos(d2/r2) - d2 * Math.sqrt(r2sq - d2 * d2);
}


