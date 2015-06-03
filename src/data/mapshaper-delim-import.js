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

MapShaper.guessDelimiter = function(content) {
  var delimiters = ['|', '\t', ','];
  return utils.find(delimiters, function(delim) {
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
// TODO: improve type detection. Mapshaper currently only checks the first
//    record, but this is obviously unreliable.
// @fieldList (optional) array of field names with type hints; may contain
//    duplicate names with inconsistent type hints.
MapShaper.adjustRecordTypes = function(records, fieldList) {
  var hintIndex = {},
      conversionIndex = {},
      firstRecord = records[0],
      fields = Object.keys(firstRecord);

  if (fieldList) {
    // parse optional type hints
    MapShaper.parseFieldHeaders(fieldList, hintIndex);
  }

  fields.forEach(function(key) {
    var val = firstRecord[key];
    if (hintIndex[key] == 'number' && !utils.isNumber(val)) {
      conversionIndex[key] = 'number';
    } else if (hintIndex[key] == 'string') {
      conversionIndex[key] = 'string';
    } else if (utils.isString(val)) {
      conversionIndex[key] = utils.stringIsNumeric(val) ? 'number' : 'string';
    } else {
      // value is not a string -- no conversion (consider making this an error)
    }
  });
  MapShaper.convertRecordTypes(records, conversionIndex);
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
    // TODO: validate field name
    return name;
  });
  return parsed;
};

utils.stringIsNumeric = function(str) {
  var parsed = utils.parseNumber(str);
  // exclude values like '300 E'
  return !isNaN(parsed) && parsed == Number(utils.cleanNumericString(str));
};

// Remove comma separators
// TODO: accept European-style numbers?
utils.cleanNumericString = function(str) {
  return str.replace(/,/g, '');
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

MapShaper.convertRecordTypes = function(records, typeIndex) {
  var typedFields = Object.keys(typeIndex),
      converters = {
        'string': utils.parseString,
        'number': utils.parseNumber
      },
      transforms = typedFields.map(function(f) {
        var type = typeIndex[f],
            converter = converters[type];
        return converter;
      });
  if (typedFields.length === 0) return;
  records.forEach(function(rec) {
    MapShaper.convertRecordData(rec, typedFields, transforms);
  });
};

MapShaper.convertRecordData = function(rec, fields, converters) {
  var f;
  for (var i=0; i<fields.length; i++) {
    f = fields[i];
    rec[f] = converters[i](rec[f]);
  }
};
