import { stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

export function hasPercentBreaks(breaks) {
  return Array.isArray(breaks) && breaks.some(isPercentBreak);
}

function isPercentBreak(val) {
  return utils.isString(val) && /%$/.test(val);
}

// Resolves breaks given as percentages of a data range ("30%" is 30% of the
// way from @range[0] to @range[1]); other breaks are values, and are kept.
// Stops if the resolved breaks don't increase.
// @range [min, max]
// Returns an array of numbers
export function resolvePercentBreaks(breaks, range) {
  var decimals = getBreakDecimals(range);
  var resolved = breaks.map(function(val) {
    var pct;
    if (!isPercentBreak(val)) return val;
    pct = Number(val.slice(0, -1));
    return +(range[0] + (range[1] - range[0]) * pct / 100).toFixed(decimals);
  });
  for (var i = 1; i < resolved.length; i++) {
    if (resolved[i] < resolved[i - 1]) {
      stop('breaks= should increase from low to high (resolved to ' + resolved.join(',') + ')');
    }
  }
  return resolved;
}

// Decimals for resolved breaks, suited to the size of the range, so that they
// can be read and pasted into a command
function getBreakDecimals(range) {
  var span = Math.abs(range[1] - range[0]);
  if (span >= 100) return 0;
  if (span >= 1) return 2;
  if (span > 0) return Math.min(10, 2 - Math.floor(Math.log10(span)));
  return 4;
}
