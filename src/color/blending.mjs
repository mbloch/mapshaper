import utils from '../utils/mapshaper-utils';
import { stop } from '../utils/mapshaper-logging';
import { parseColor, validateColor } from '../color/color-utils';
import { formatColor } from '../color/color-utils';

export function blend(a, b) {
  var colors, weights, args;
  if (Array.isArray(a)) {
    colors = a;
    weights = b;
  } else {
    colors = [];
    weights = [];
    args = Array.from(arguments);
    for (var i=0; i<args.length; i+= 2) {
      colors.push(args[i]);
      weights.push(args[i + 1]);
    }
  }
  weights = normalizeWeights(weights);
  if (!weights) return '#eee';
  var blended = colors.reduce(function(memo, col, i) {
    var rgb = validateColor(col) && parseColor(col);
    var w = +weights[i] || 0;
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


