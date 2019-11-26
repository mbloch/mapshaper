/* @requires mapshaper-common */


internal.getLayerDataTable = function(lyr) {
  var data = lyr.data;
  if (!data) {
    data = lyr.data = new DataTable(lyr.shapes ? lyr.shapes.length : 0);
  }
  return data;
};


// Not a general-purpose deep copy function
internal.copyRecord = function(o) {
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
      o2[key] = val && val.constructor === Object ? internal.copyRecord(val) : val;
    }
  }
  return o2;
};


// Insert a column of values into a (new or existing) data field
internal.insertFieldValues = function(lyr, fieldName, values) {
  var size = internal.getFeatureCount(lyr) || values.length,
      table = lyr.data = (lyr.data || new DataTable(size)),
      records = table.getRecords();
  internal.insertFieldValues2(fieldName, table.getRecords(), values);
};

internal.insertFieldValues2 = function(key, records, values) {
  var n = records.length,
      i, rec, val;
  for (i=0, n=records.length; i<n; i++) {
    rec = records[i];
    val = values[i];
    if (!rec) rec = records[i] = {};
    rec[key] = val === undefined ? null : val;
  }
};

internal.getValueType = function(val) {
  var type = null;
  if (utils.isString(val)) {
    type = 'string';
  } else if (utils.isNumber(val)) {
    type = 'number';
  } else if (utils.isBoolean(val)) {
    type = 'boolean';
  } else if (utils.isObject(val)) {
    type = 'object';
  }
  return type;
};

// Fill out a data table with undefined values
// The undefined members will disappear when records are exported as JSON,
// but will show up when fields are listed using Object.keys()
internal.fixInconsistentFields = function(records) {
  var fields = internal.findIncompleteFields(records);
  internal.patchMissingFields(records, fields);
};

internal.findIncompleteFields = function(records) {
  var counts = {},
      i, j, keys;
  for (i=0; i<records.length; i++) {
    keys = Object.keys(records[i] || {});
    for (j=0; j<keys.length; j++) {
      counts[keys[j]] = (counts[keys[j]] | 0) + 1;
    }
  }
  return Object.keys(counts).filter(function(k) {return counts[k] < records.length;});
};

internal.patchMissingFields = function(records, fields) {
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
};

internal.fieldListContainsAll = function(list, fields) {
  return list.indexOf('*') > -1 || utils.difference(fields, list).length === 0;
};

internal.getColumnType = function(key, records) {
  var type = null,
      rec;
  for (var i=0, n=records.length; i<n; i++) {
    rec = records[i];
    type = rec ? internal.getValueType(rec[key]) : null;
    if (type) break;
  }
  return type;
};

internal.deleteFields = function(table, test) {
  table.getFields().forEach(function(name) {
    if (test(name)) {
      table.deleteField(name);
    }
  });
};

internal.isInvalidFieldName = function(f) {
  // Reject empty and all-whitespace strings. TODO: consider other criteria
  return /^\s*$/.test(f);
};

// Resolve name conflicts in field names by appending numbers
// @fields Array of field names
// @maxLen (optional) Maximum chars in name
//
internal.getUniqFieldNames = function(fields, maxLen) {
  var used = {};
  return fields.map(function(name) {
    var i = 0,
        validName;
    do {
      validName = internal.adjustFieldName(name, maxLen, i);
      i++;
    } while ((validName in used) ||
      // don't replace an existing valid field name with a truncated name
      name != validName && utils.contains(fields, validName));
    used[validName] = true;
    return validName;
  });
};


internal.getUniqFieldValues = function(records, field) {
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
};

// Truncate and/or uniqify a name (if relevant params are present)
internal.adjustFieldName = function(name, maxLen, i) {
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
};

internal.applyFieldOrder = function(arr, option) {
  if (option == 'ascending') {
    arr.sort(function(a, b) {
      return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
    });
  }
  return arr;
};

internal.findFieldNames = function(records, order) {
  var first = records[0];
  var names = first ? Object.keys(first) : [];
  return internal.applyFieldOrder(names, order);
};
