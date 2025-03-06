import { getDiscreteValueGetter } from '../classification/mapshaper-classification';

export function getCategoricalClassifier(classValues, nullVal, opts) {
  // categories: strings to match in the data
  var categories = opts.categories;
  // index categories for better performance on datasets with many categories
  var index = categories.reduce((memo, key, i) => {
    memo[key] = i;
    return memo;
  }, {});
  var classToValue = getDiscreteValueGetter(classValues, nullVal, opts.other);
  return function(val) {
    var i;
    if (val in index) {
      i = index[val];
    } else if (val || val === 0) {
      i = -2; // -2 indicates an 'other' value
    } else {
      i = -1; // field is empty (null value)
    }
    return classToValue(i);
  };
}
