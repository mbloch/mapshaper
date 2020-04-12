
import { getAffineTransform } from '../commands/mapshaper-affine';
import { forEachPoint } from '../points/mapshaper-point-utils';

export function rotateSymbolCoords(coords, rotation) {
  var f;
  if (!rotation) return;
  // invert sign of rotation, because y-axis is flipped in SVG/HTML screen coords.
  f = getAffineTransform(-rotation, 1, [0, 0], [0, 0]);
  // TODO: avoid re-instantiating function on every call
  forEachPoint(coords, function(p) {
    var p2 = f(p[0], p[1]);
    p[0] = p2[0];
    p[1] = p2[1];
  });
}
