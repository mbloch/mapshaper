
import utils from '../utils/mapshaper-utils';
import { encodeString } from '../text/mapshaper-encodings';

// Not a general-purpose deep copy function
export function copyRecord(o) {
  var o2 = {}, key, val;
  if (!o) return null;
  for (key in o) {
    if (o.hasOwnProperty(key)) {
      val = o[key];
      if (val == o) {
        // avoid infinite recursion if val is a circular reference, by copying all properties except key
        val = utils.extend({}, val);
        delete val[key];
      }
      o2[key] = val && val.constructor === Object ? copyRecord(val) : val;
    }
  }
  return o2;
}

export function getValueType(val) {
  var type = null;
  if (utils.isString(val)) {
    type = 'string';
  } else if (utils.isNumber(val)) {
    type = 'number';
  } else if (utils.isBoolean(val)) {
    type = 'boolean';
  } else if (utils.isDate(val)) {
    type = 'date';
  } else if (utils.isObject(val)) {
    type = 'object';
  }
  return type;
}

// Fill out a data table with undefined values
// The undefined members will disappear when records are exported as JSON,
// but will show up when fields are listed using Object.keys()
export function fixInconsistentFields(records) {
  var fields = findIncompleteFields(records);
  patchMissingFields(records, fields);
}

function findIncompleteFields(records) {
  var counts = {},
      i, j, keys;
  for (i=0; i<records.length; i++) {
    keys = Object.keys(records[i] || {});
    for (j=0; j<keys.length; j++) {
      counts[keys[j]] = (counts[keys[j]] | 0) + 1;
    }
  }
  return Object.keys(counts).filter(function(k) {return counts[k] < records.length;});
}

function patchMissingFields(records, fields) {
  var rec, i, j, f;
  for (i=0; i<records.length; i++) {
    rec = records[i] || (records[i] = {});
    for (j=0; j<fields.length; j++) {
      f = fields[j];
      if (f in rec === false) {
        rec[f] = undefined;
      }
    }
  }
}

export function fieldListContainsAll(list, fields) {
  return list.indexOf('*') > -1 || utils.difference(fields, list).length === 0;
}

export function getColumnType(key, records) {
  var type = null,
      rec;
  for (var i=0, n=records.length; i<n; i++) {
    rec = records[i];
    type = rec ? getValueType(rec[key]) : null;
    if (type) break;
  }
  return type;
}

export function deleteFields(table, test) {
  table.getFields().forEach(function(name) {
    if (test(name)) {
      table.deleteField(name);
    }
  });
}

export function isInvalidFieldName(f) {
  // Reject empty and all-whitespace strings. TODO: consider other criteria
  return /^\s*$/.test(f);
}

// Resolve name conflicts in field names by appending numbers
// @fields Array of field names
// @maxLen (optional) Maximum chars in name
//
export function getUniqFieldNames(fields, maxLen, encoding) {
  var used = {};
  return fields.map(function(name) {
    var i = 0,
        validName;
    do {
      validName = encoding && encoding != 'ascii' ?
        adjustEncodedFieldName(name, maxLen, i, encoding) :
        adjustFieldName(name, maxLen, i);
      i++;
    } while ((validName in used) ||
      // don't replace an existing valid field name with a truncated name
      name != validName && utils.contains(fields, validName));
    used[validName] = true;
    return validName;
  });
}

export function getFieldValues(records, field) {
  return records.map(function(rec) {
    return rec ? rec[field] : undefined;
  });
}

export function getUniqFieldValues(records, field) {
  var index = {};
  var values = [];
  records.forEach(function(rec) {
    var val = rec[field];
    if (val in index === false) {
      index[val] = true;
      values.push(val);
    }
  });
  return values;
}

// Truncate and/or uniqify a name (if relevant params are present)
function adjustFieldName(name, maxLen, i) {
  var name2, suff;
  maxLen = maxLen || 256;
  if (!i) {
    name2 = name.substr(0, maxLen);
  } else {
    suff = String(i);
    if (suff.length == 1) {
      suff = '_' + suff;
    }
    name2 = name.substr(0, maxLen - suff.length) + suff;
  }
  return name2;
}

// Truncate and/or uniqify a name (if relevant params are present)
function adjustEncodedFieldName(name, maxLen, i, encoding) {
  var suff = i ? String(i) : '';
  var name2 = name + suff;
  var buf = encodeString(name2, encoding);
  if (buf.length > (maxLen || 256)) {
    name = name.substr(0, name.length - 1);
    return adjustEncodedFieldName(name, maxLen, i, encoding);
  }
  return name2;
}

export function applyFieldOrder(arr, option) {
  if (option == 'ascending') {
    arr.sort(function(a, b) {
      return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
    });
  }
  return arr;
}

export function getFirstNonEmptyRecord(records) {
  for (var i=0, n=records ? records.length : 0; i<n; i++) {
    if (records[i]) return records[i];
  }
  return null;
}

export function findFieldNames(records, order) {
  var first = getFirstNonEmptyRecord(records);
  var names = first ? Object.keys(first) : [];
  return applyFieldOrder(names, order);
}
