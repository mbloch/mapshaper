import { stop, error } from '../utils/mapshaper-logging';
import { interpolate as d3_interpolate } from 'd3-interpolate';

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

export function getStoppedValues(values, stops) {
  var interpolate = getInterpolatedValueGetter(values, null);
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
export function getInterpolatedValueGetter(values, nullValue) {
  var interpolators = [];
  var tmax = values.length - 1;
  for (var i=1; i<values.length; i++) {
    interpolators.push(d3_interpolate(values[i-1], values[i]));
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
export function interpolateValuesToClasses(values, n, stops) {
  if (values.length == n && !stops) return values;
  var numPairs = values.length - 1;
  var output = [values[0]];
  var k, j, t, intVal;
  for (var i=1; i<n-1; i++) {
    k = i / (n-1) * numPairs;
    j = Math.floor(k);
    t = k - j;
    // if (convert) t = convert(t);
    intVal = d3_interpolate(values[j], values[j+1])(t);
    output.push(intVal);
  }
  output.push(values[values.length - 1]);
  if (stops) {
    output = getStoppedValues(output, stops);
  }
  return output;
}
