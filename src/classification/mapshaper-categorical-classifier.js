import { getDiscreteValueGetter } from '../classification/mapshaper-classification';

export function getCategoricalClassifier(classValues, nullVal, opts) {
  // categories: strings to match in the data
  var categories = opts.categories;
  var classToValue = getDiscreteValueGetter(classValues, nullVal, opts.other);
  return function(val) {
    var i = categories.indexOf(val);
    var idx = -1;
    if (i >= 0) {
      idx = i;
    } else if (val) {
      idx = -2; // field contains an 'other' value
    } else {
      idx = -1; // field is empty (null value)
    }
    return classToValue(idx);
  };
}
