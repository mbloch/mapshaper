/* @requires mapshaper-data-table */

// Convert a string containing delimited text data into a dataset object
MapShaper.importDelim = function(str, opts) {
  var delim = MapShaper.guessDelimiter(str);
  return {
    layers: [{
      data: MapShaper.importDelimTable(str, delim, opts)
    }],
    info: {
      input_delimiter: delim
    }
  };
};

MapShaper.importDelimTable = function(str, delim, opts) {
  var records = require("./lib/d3/d3-dsv.js").dsv(delim).parse(str);
  if (records.length === 0) {
    stop("[dsv] Unable to read any records");
  }
  MapShaper.adjustRecordTypes(records, opts && opts.field_types);
  return new DataTable(records);
};

MapShaper.supportedDelimiters = ['|', '\t', ',', ';'];

MapShaper.isSupportedDelimiter = function(d) {
  return utils.contains(MapShaper.supportedDelimiters, d);
};

MapShaper.guessDelimiter = function(content) {
  return utils.find(MapShaper.supportedDelimiters, function(delim) {
    var rxp = MapShaper.getDelimiterRxp(delim);
    return rxp.test(content);
  }) || ',';
};

// Get RegExp to test for a delimiter before first line break of a string
// Assumes that the first line does not contain alternate delim chars (this will
// be true if the first line has field headers composed of word characters).
MapShaper.getDelimiterRxp = function(delim) {
  var rxp = "^[^\\n\\r]+" + utils.regexEscape(delim);
  return new RegExp(rxp);
};

// Detect and convert data types of data from csv files.
// TODO: decide how to handle records with inconstent properties. Mapshaper
//    currently assumes tabular data
// @fieldList (optional) array of field names with type hints; may contain
//    duplicate names with inconsistent type hints.
MapShaper.adjustRecordTypes = function(records, fieldList) {
  var hintIndex = {},
      fields = Object.keys(records[0] || []),
      type;
  if (fieldList) {
    // parse optional type hints
    MapShaper.parseFieldHeaders(fieldList, hintIndex);
  }
  fields.forEach(function(key) {
    type = hintIndex[key] || MapShaper.detectConversionType(key, records);
    if (type == 'number') {
      MapShaper.convertDataField(records, key, utils.parseNumber);
    } else if (type == 'string') {
      MapShaper.convertDataField(records, key, utils.parseString);
    }
  });
};

MapShaper.convertDataField = function(records, name, f) {
  for (var i=0, n=records.length; i<n; i++) {
    records[i][name] = f(records[i][name]);
  }
};

// Returns 'string', 'number' or null
// Detection is based on value of first non-empty record
MapShaper.detectConversionType = function(name, records) {
  var type = null, val;
  for (var i=0, n=records.length; i<n; i++) {
    val = records[i][name];
    if (!!val && utils.isString(val)) {
      type = utils.stringIsNumeric(val) ? 'number' : 'string';
      break;
    }
  }
  return type;
};

// Accept a type hint from a header like "FIPS:str"
// Return standard type name (number|string) or null if hint is not recognized
MapShaper.validateFieldType = function(hint) {
  var str = hint.toLowerCase(),
      type = null;
  if (str[0] == 'n') {
    type = 'number';
  } else if (str[0] == 's') {
    type = 'string';
  }
  return type;
};

MapShaper.removeTypeHints = function(arr) {
  return MapShaper.parseFieldHeaders(arr, {});
};

// Look for type hints in array of field headers
// return index of field types
// modify @fields to remove type hints
//
MapShaper.parseFieldHeaders = function(fields, index) {
  var parsed = fields.map(function(raw) {
    var parts, name, type;
    if (raw.indexOf(':') != -1) {
      parts = raw.split(':');
      name = parts[0];
      type = MapShaper.validateFieldType(parts[1]);
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

utils.stringIsNumeric = function(str) {
  var parsed = utils.parseNumber(str);
  // exclude values like '300 E'
  return !isNaN(parsed) && parsed == Number(utils.cleanNumericString(str));
};

// Remove comma separators from strings
// TODO: accept European-style numbers?
utils.cleanNumericString = function(raw) {
  return String(raw).replace(/,/g, '');
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
  var parsed = raw ? parseFloat(utils.cleanNumericString(raw)) : NaN;
  return isNaN(parsed) ? null : parsed;
};
