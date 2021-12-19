import { roundToTenths } from '../geom/mapshaper-rounding';
export var symbolRenderers = {};

export function getTransform(xy, scale) {
  var str = 'translate(' + roundToTenths(xy[0]) + ' ' + roundToTenths(xy[1]) + ')';
  if (scale && scale != 1) {
    str += ' scale(' + scale + ')';
  }
  return str;
}
