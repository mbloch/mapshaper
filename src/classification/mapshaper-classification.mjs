
import {
  getInterpolatedValueGetter
} from '../classification/mapshaper-interpolation';

// convert an index (0 ... n-1, -1, -2) to a corresponding discreet value
export function getDiscreteValueGetter(values, nullValue, otherValue) {
  var n = values.length;
  return function(i) {
    if (i >= 0 && i < n) {
      return values[i];
    }
    if (i == -2) {
      return otherValue === undefined ? nullValue : otherValue;
    }
    return nullValue;
  };
}

export function getOutputFunction(classValues, nullValue, opts) {
  // get a function to convert class indexes to output values
  //
  if (opts.continuous) {
    return getInterpolatedValueGetter(classValues, nullValue);
  } else {
    return  getDiscreteValueGetter(classValues, nullValue, opts.other);
  }
}

