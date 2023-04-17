import { stop } from '../utils/mapshaper-logging';

var sequential = ['quantile', 'nice', 'equal-interval', 'hybrid', 'breaks'];
var all = ['non-adjacent', 'indexed', 'categorical', 'blacki'].concat(sequential);

export function getClassifyMethod(opts, dataType) {
  var method;
  if (opts.method) {
    method = opts.method;
  } else if (opts.breaks) {
    method = 'breaks';
  } else if (opts.index_field) {
    method = 'indexed';
  } else if (opts.categories || dataType == 'string') {
    method = 'categorical';
  } else  if (dataType == 'number') {
    method = 'quantile'; // TODO: validate data field
  } else if (dataType == 'date' || dataType == 'object') {
    stop('Data type does not support classification:', dataType);
  } else if (dataType === null) {
    // data field is empty
    return null; // kludge
  } else if (dataType === undefined) {
    // no data field was given
    stop('Expected a data field to classify or the non-adjacent option');
  } else {
    stop('Unable to determine which classification method to use.');
  }
  if (!all.includes(method)) {
    stop('Not a recognized classification method:', method);
  }
  if (sequential.includes(method) && dataType != 'number' && dataType !== null) {
    stop('The', method, 'method requires a numerical data field');
  }
  return method;
}
