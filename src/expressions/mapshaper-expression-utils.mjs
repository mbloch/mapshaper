import utils from '../utils/mapshaper-utils';
import { blend } from '../color/blending';
import { roundToDigits2 } from '../geom/mapshaper-rounding';
import { formatDMS, parseDMS } from '../geom/mapshaper-dms';
import { stop } from '../utils/mapshaper-logging';

export function addFeatureExpressionUtils(env) {
  Object.assign(env, {
    round: roundToDigits2,
    int_median: interpolated_median,
    sprintf: utils.format,
    blend: blend,
    format_dms: formatDMS,
    parse_dms: parseDMS
  });
}

export function requireBooleanResult(val, msg) {
  if (val !== true && val !== false) {
    stop(msg || 'Filter expression must return true or false');
  }
}

// piecewise linear interpolation (for a special project)
export function interpolated_median(counts, breaks) {
  if (!counts || !breaks || counts.length != breaks.length - 1) return null;
  var total = utils.sum(counts);
  var medianIdx = Math.floor(total / 2);
  var lowerCount = 0, upperCount, lowerValue, upperValue, t;
  for (var i=1; i<breaks.length; i++) {
    lowerValue = breaks[i-1];
    upperValue = breaks[i];
    upperCount = lowerCount + counts[i-1];
    if (medianIdx <= upperCount) {
      t = (medianIdx - lowerCount) / (upperCount - lowerCount);
      return lowerValue + t * (upperValue - lowerValue);
    }
    lowerCount = upperCount;
  }
  return null;
}

export function addGetters(obj, getters) {
  Object.keys(getters).forEach(function(name) {
    var val = getters[name];
    var o = typeof val == 'function' ?
      {get: val} :
      {value: val, writable: false};
    Object.defineProperty(obj, name, o);
  });
}
