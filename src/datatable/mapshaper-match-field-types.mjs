import utils from '../utils/mapshaper-utils';
import { getColumnType } from './mapshaper-data-utils';

// Makes the values of a feature about to join a layer match the types the
// layer already holds, so that adding a feature cannot be the thing that breaks
// a layer's schema. Used by the commands that add one feature at a time
// (-add-shape, -labels coordinates=).
//
// Only string and number are worth reconciling. Anything else in a field is
// odd enough that quietly rewriting it would hide a real problem.
//
// d: the new feature's properties (modified in place)
// targetLyr: the layer the feature is joining, or null
export function matchTargetFieldTypes(d, targetLyr) {
  var records = targetLyr && targetLyr.data ? targetLyr.data.getRecords() : null;
  if (!d || !records || records.length === 0) return;
  Object.keys(d).forEach(function(key) {
    var type = getColumnType(key, records);
    var val = d[key];
    if (!type || type === typeof val) return;
    if (type == 'string' && utils.isNumber(val)) {
      d[key] = String(val);
    } else if (type == 'number' && utils.isString(val)) {
      if (isFiniteString(val)) {
        d[key] = Number(val);
      } else {
        stringifyColumn(key, records);
      }
    }
  });
}

// Widens a column of numbers to strings, for a value that cannot be a number:
// '0.45em' is a length with units, which is what a label position east of its
// anchor expands to.
//
// Every number has a faithful string form, and these values are written out as
// SVG attributes, so restating 0 as '0' changes nothing that is drawn or
// exported. Narrowing the other way is what is not always possible, which is
// why this is the direction the column moves.
//
// Reached by a layer whose dx column holds numbers -- written before label
// positions stored dx as a string -- which would otherwise refuse every label
// offered an em offset.
function stringifyColumn(key, records) {
  for (var i = 0; i < records.length; i++) {
    if (records[i] && utils.isNumber(records[i][key])) {
      records[i][key] = String(records[i][key]);
    }
  }
}

function isFiniteString(str) {
  return str.trim() !== '' && utils.isFiniteNumber(Number(str));
}
