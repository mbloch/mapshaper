import { stop } from '../utils/mapshaper-logging';

var sequential = ['quantile', 'nice', 'equal-interval', 'hybrid'];
var all = ['non-adjacent', 'indexed', 'categorical'].concat(sequential);

export function getClassifyMethod(opts, dataFieldType) {
  var method;
  if (opts.method) {
    method = opts.method;
  } else if (opts.index_field) {
    method = 'indexed';
  } else if (opts.categories || dataFieldType == 'string') {
    method = 'categorical';
  } else  if (dataFieldType == 'number') {
    method = 'quantile'; // TODO: validate data field
  } else {
    // stop('Unable to determine which classification method to use.');
    stop('Missing a data field and/or classification method');
  }
  if (!all.includes(method)) {
    stop('Not a recognized classification method:', method);
  }
  if (sequential.includes(method) && dataFieldType != 'number') {
    stop('The', method, 'method requires a numerical data field');
  }
  return method;
}
