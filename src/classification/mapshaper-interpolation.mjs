import { stop, error } from '../utils/mapshaper-logging';
import { interpolate as d3_interpolate } from 'd3-interpolate';
import { interpolateOklch, getVibrantColor, getVibranceChroma } from '../color/oklab';
import { parseColor } from '../color/color-utils';

// TODO: support three or more stops
export function getGradientFunction(stops) {
  var min = stops[0] / 100,
      max = stops[1] / 100;
  if (stops.length != 2) {
    stop('Only two stops are currently supported');
  }
  if (!(min >= 0 && max <= 1 && min < max)) {
    stop('Invalid gradient stops:', stops);
  }
  return function(t) {
    return t * (max - min) + min;
  };
}

// Returns the interpolation options of -classify, checked, with
// interpolation=oklch filled in when vibrance= is given without a method.
// vibrance= (0-1) is returned as OKLCH chroma, as the interpolators take it.
export function getInterpolationOptions(opts) {
  var method = opts.interpolation;
  var vibrance = opts.vibrance;
  if (method && method != 'rgb' && method != 'oklch') {
    stop('Unsupported interpolation method:', method, '(expected rgb or oklch)');
  }
  if (vibrance === undefined) {
    return {interpolation: method};
  }
  if (method && method != 'oklch') {
    stop('vibrance= requires interpolation=oklch');
  }
  if (!(vibrance >= 0 && vibrance <= 1)) {
    stop('vibrance= takes a value from 0 to 1');
  }
  return {interpolation: 'oklch', vibrance: getVibranceChroma(vibrance)};
}

// opts.interpolation: 'rgb' (default) or 'oklch'; oklch applies only to pairs
// of colors. opts.vibrance goes with oklch (see
// interpolateOklch()).
export function getPairInterpolator(a, b, opts) {
  var method = opts && opts.interpolation;
  if (method == 'oklch' && parseColor(a) && parseColor(b)) {
    return interpolateOklch(a, b, opts);
  }
  return d3_interpolate(a, b);
}

// opts: interpolation options (see getPairInterpolator())
export function getStoppedValues(values, stops, opts) {
  var interpolate = getInterpolatedValueGetter(values, null, opts);
  var n = values.length;
  var fstop = getGradientFunction(stops);
  var values2 = [];
  var t, val;
  for (var i=0; i<n; i++) {
    t = fstop(i / (n - 1));
    val = interpolate(t * (n - 1));
    values2.push(val);
  }
  return values2;
}

// convert a continuous index ([0, n-1], -1) to a corresponding interpolated value
export function getInterpolatedValueGetter(values, nullValue, opts) {
  var interpolators = [];
  var tmax = values.length - 1;
  for (var i=1; i<values.length; i++) {
    interpolators.push(getPairInterpolator(values[i-1], values[i], opts));
  }
  return function(t) {
    if (t == -1) return nullValue;
    if ((t >= 0 && t <= tmax) === false) {
      error('Range error');
    }
    var i = t == tmax ? tmax - 1 : Math.floor(t);
    var j = t == tmax ? 1 : t % 1;
    return interpolators[i](j);
  };
}

// return an array of n values
// assumes that values can be interpolated by d3-interpolate
// (colors and numbers should work)
export function interpolateValuesToClasses(values, n, stops, opts) {
  if (values.length == n && !stops) return getVibrantValues(values, opts);
  var numPairs = values.length - 1;
  var pairOpts = Object.assign({}, opts, {steps: (n - 1) / numPairs});
  var output = [getVibrantValues(values, opts)[0]];
  var k, j, t, intVal;
  for (var i=1; i<n-1; i++) {
    k = i / (n-1) * numPairs;
    j = Math.floor(k);
    t = k - j;
    // if (convert) t = convert(t);
    intVal = getPairInterpolator(values[j], values[j+1], pairOpts)(t);
    output.push(intVal);
  }
  output.push(getVibrantValues(values, opts)[values.length - 1]);
  if (stops) {
    // the colors already have their vibrance
    output = getStoppedValues(output, stops, {interpolation: opts && opts.interpolation});
  }
  return output;
}

// The user's colors, with vibrance added (see getVibrantColor()), as the
// oklch interpolator gives them at the ends of each pair
function getVibrantValues(values, opts) {
  var vibrance = opts && opts.interpolation == 'oklch' && opts.vibrance;
  if (!(vibrance > 0)) return values;
  return values.map(function(val) {
    return parseColor(val) ? getVibrantColor(val, vibrance) : val;
  });
}
