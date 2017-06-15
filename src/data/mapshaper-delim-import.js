/* @requires mapshaper-data-table, mapshaper-data-utils */

// Convert a string containing delimited text data into a dataset object
internal.importDelim = function(str, opts) {
  var delim = internal.guessDelimiter(str);
  return {
    layers: [{
      data: internal.importDelimTable(str, delim, opts)
    }],
    info: {
      input_delimiter: delim
    }
  };
};

internal.importDelimTable = function(str, delim, opts) {
  var records = require("d3-dsv").dsvFormat(delim).parse(str);
  var table;
  if (records.length === 0) {
    stop("Unable to read any records");
  }
  delete records.columns; // added by d3-dsv
  internal.adjustRecordTypes(records, opts && opts.field_types);
  table = new DataTable(records);
  internal.deleteFields(table, internal.isInvalidFieldName);
 return table;
};

internal.supportedDelimiters = ['|', '\t', ',', ';'];

internal.isSupportedDelimiter = function(d) {
  return utils.contains(internal.supportedDelimiters, d);
};

internal.guessDelimiter = function(content) {
  return utils.find(internal.supportedDelimiters, function(delim) {
    var rxp = internal.getDelimiterRxp(delim);
    return rxp.test(content);
  }) || ',';
};

// Get RegExp to test for a delimiter before first line break of a string
// Assumes that the first line does not contain alternate delim chars (this will
// be true if the first line has field headers composed of word characters).
internal.getDelimiterRxp = function(delim) {
  var rxp = "^[^\\n\\r]+" + utils.regexEscape(delim);
  return new RegExp(rxp);
};

// Detect and convert data types of data from csv files.
// TODO: decide how to handle records with inconstent properties. Mapshaper
//    currently assumes tabular data
// @fieldList (optional) array of field names with type hints; may contain
//    duplicate names with inconsistent type hints.
internal.adjustRecordTypes = function(records, fieldList) {
  var hintIndex = {},
      fields = Object.keys(records[0] || []),
      detectedNumFields = [];
  if (fieldList) {
    // parse optional type hints
    internal.parseFieldHeaders(fieldList, hintIndex);
  }
  fields.forEach(function(key) {
    var typeHint = hintIndex[key];
    var type = internal.adjustFieldValues(key, records, typeHint);
    if (!typeHint && type == 'number') {
      detectedNumFields.push(key);
    }
  });
  if (detectedNumFields.length > 0) {
    message(utils.format("Auto-detected number field%s: %s",
        detectedNumFields.length == 1 ? '' : 's', detectedNumFields.join(', ')));
  }
};

internal.adjustFieldValues = function(key, records, type) {
  var values;
  if (!type) {
    values = internal.tryNumericField(key, records);
  }
  if (values) {
    type = 'number';
    internal.insertFieldValues2(key, records, values);
  } else if (type == 'number') {
    internal.convertDataField(key, records, utils.parseNumber);
  } else {
    type = 'string';
    internal.convertDataField(key, records, utils.parseString);
  }
  return type;
};

internal.tryNumericField = function(key, records) {
  var arr = [],
      count = 0,
      raw, num;
  for (var i=0, n=records.length; i<n; i++) {
    raw = records[i][key];
    num = utils.parseNumber(raw);
    if (num !== null) {
      count++;
    } else if (raw && raw.trim()) {
      return null; // unparseable value -- fail
    }
    arr.push(num);
  }
  return count > 0 ? arr : null;
};

internal.convertDataField = function(name, records, f) {
  for (var i=0, n=records.length; i<n; i++) {
    records[i][name] = f(records[i][name]);
  }
};

// Accept a type hint from a header like "FIPS:str"
// Return standard type name (number|string) or null if hint is not recognized
internal.validateFieldType = function(hint) {
  var str = hint.toLowerCase(),
      type = null;
  if (str[0] == 'n') {
    type = 'number';
  } else if (str[0] == 's') {
    type = 'string';
  }
  return type;
};


// Look for type hints in array of field headers
// return index of field types
// modify @fields to remove type hints
//
internal.parseFieldHeaders = function(fields, index) {
  var parsed = fields.map(function(raw) {
    var parts, name, type;
    if (raw.indexOf(':') != -1) {
      parts = raw.split(':');
      name = parts[0];
      type = internal.validateFieldType(parts[1]);
      if (!type) {
        message("Invalid type hint (expected :str or :num) [" + raw + "]");
      }
    } else if (raw[0] === '+') { // d3-style type hint: unary plus
      name = raw.substr(1);
      type = 'number';
    } else {
      name = raw;
    }
    if (type) {
      index[name] = type;
    }
    return name;
  });
  return parsed;
};

// Remove comma separators from strings
// TODO: accept European-style numbers?
utils.cleanNumericString = function(raw) {
  return raw.replace(/,/g, '');
};

// Assume: @raw is string, undefined or null
utils.parseString = function(raw) {
  return raw ? raw : "";
};

// Assume: @raw is string, undefined or null
// Use null instead of NaN for unparsable values
// (in part because if NaN is used, empty strings get converted to "NaN"
// when re-exported).
utils.parseNumber = function(raw) {
  var str = String(raw).trim();
  var parsed = str ? Number(utils.cleanNumericString(str)) : NaN;
  return isNaN(parsed) ? null : parsed;
};
