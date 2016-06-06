/* @requires mapshaper-common */

MapShaper.getValueType = function(val) {
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

MapShaper.getColumnType = function(key, table) {
  var type = null,
      records = table.getRecords(),
      rec;
  for (var i=0, n=table.size(); i<n; i++) {
    rec = records[i] || {};
    type = MapShaper.getValueType(rec[key]);
    if (type) break;
  }
  return type;
};

MapShaper.deleteFields = function(table, test) {
  table.getFields().forEach(function(name) {
    if (test(name)) {
      table.deleteField(name);
    }
  });
};

MapShaper.isInvalidFieldName = function(f) {
  // Reject empty and all-whitespace strings. TODO: consider other criteria
  return /^\s*$/.test(f);
};

// Resolve name conflicts in field names by appending numbers
// @fields Array of field names
// @maxLen (optional) Maximum chars in name
//
MapShaper.getUniqFieldNames = function(fields, maxLen) {
  var used = {};
  return fields.map(function(name) {
    var i = 0,
        validName;
    do {
      validName = MapShaper.adjustFieldName(name, maxLen, i);
      i++;
    } while (validName in used);
    used[validName] = true;
    return validName;
  });
};

// Truncate and/or uniqify a name (if relevant params are present)
MapShaper.adjustFieldName = function(name, maxLen, i) {
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
