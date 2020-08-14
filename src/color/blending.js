import utils from '../utils/mapshaper-utils';
import { stop } from '../utils/mapshaper-logging';
import { parseColor } from '../color/color-utils';
import { formatColor } from '../color/color-utils';

export function blend() {
  var args = Array.from(arguments);
  var colors = [],
      weights = [],
      col, weight, i;
  for (i=0; i<args.length; i+= 2) {
    colors.push(parseColor(args[i]));
    weights.push(+args[i + 1] || 0);
  }
  weights = normalizeWeights(weights);
  if (!weights) return '#eee';
  var blended = colors.reduce(function(memo, rgb, i) {
    var w = weights[i];
    memo.r += rgb.r * w;
    memo.g += rgb.g * w;
    memo.b += rgb.b * w;
    return memo;
  }, {r: 0, g: 0, b: 0});
  return formatColor(blended);
}

function normalizeWeights(weights) {
  var sum = utils.sum(weights);
  if (sum > 0 === false) {
    return null;
  }
  return weights.map(function(w) {
    return w / sum;
  });
}


