import utils from '../utils/mapshaper-utils';
import { stop } from '../utils/mapshaper-logging';
import { getOutputFunction } from '../classification/mapshaper-classification';

export function getIndexedClassifier(values, nullVal, opts) {
  // TODO: handle continuous classification
  var numBuckets = values.length;
  var classToValue = getOutputFunction(values, nullVal, opts);

  return function(val) {
    var idx = utils.isInteger(val) && val >= 0 && val < numBuckets ? val : -1;
    return classToValue(idx);
  };
}

// returns the number of classes, based on the largest class index found
export function getIndexedClassCount(records, name) {
  var invalid = [];
  var maxId = -1;
  records.forEach(function(d) {
    var val = (d || {})[name];
    if (!utils.isInteger(val) || val < -2) {
      invalid.push(val);
    } else {
      maxId = Math.max(maxId, val);
    }
  });
  if (invalid.length > 0) {
    stop(`Class index field contains invalid value(s): ${invalid.slice(0, 5)}`);
  }
  return maxId + 1;
}
