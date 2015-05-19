/* @requires mapshaper-data-table */

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

MapShaper.exportDelim = function(dataset, opts) {
  var delim = opts.delimiter || dataset.info.input_delimiter || ',',
      ext = MapShaper.getDelimFileExtension(delim);
  return dataset.layers.map(function(lyr) {
    return {
      content: MapShaper.exportDelimTable(lyr, delim),
      filename: (lyr.name || 'output') + '.' + ext
    };
  });
};

MapShaper.exportDelimTable = function(lyr, delim) {
  var dsv = require("./lib/d3/d3-dsv.js").dsv(delim);
  return dsv.format(lyr.data.getRecords());
};

MapShaper.getDelimFileExtension = function(delim) {
  var ext = 'txt';
  if (delim == '\t') {
    ext = 'tsv';
  } else if (delim == ',') {
    ext = 'csv';
  }
  return ext;
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
  var parsed = utils.map(fields, function(raw) {
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

//
MapShaper.guessDelimiter = function(content) {
  var delimiters = ['|', '\t', ','];
  return utils.find(delimiters, function(delim) {
    var rxp = MapShaper.getDelimiterRxp(delim);
    return rxp.test(content);
  }) || ',';
};

// Get RegExp to test for a delimiter before first line break of a string
// Assumes that first line contains field headers and that header names do not include delim char
MapShaper.getDelimiterRxp = function(delim) {
  var rxp = "^[^\\n\\r]+" + utils.regexEscape(delim);
  return new RegExp(rxp);
};

// Detect and convert data types, with optional type hints
// @fieldList (optional) array of field names with type hints; may contain
//    duplicate names with inconsistent type hints.
MapShaper.adjustRecordTypes = function(records, fieldList) {
  var hintIndex = {},
      conversionIndex = {},
      firstRecord = records[0],
      fields = Object.keys(firstRecord);

  // parse type hints
  if (fieldList) {
    MapShaper.parseFieldHeaders(fieldList, hintIndex);
  }

  fields.forEach(function(key) {
    var val = firstRecord[key];
    if (key in hintIndex === false) {
      if (utils.isString(val) && utils.stringIsNumeric(val)) {
        conversionIndex[key] = 'number';
      }
    } else if (hintIndex[key] == 'number' && !utils.isNumber(val)) {
      conversionIndex[key] = 'number';
    } else if (hintIndex[key] == 'string' && !utils.isString(val)) {
      conversionIndex[key] = 'string';
    }
  });
  MapShaper.convertRecordTypes(records, conversionIndex);
};

utils.stringIsNumeric = function(str) {
  str = utils.cleanNumber(str);
  // Number() accepts empty strings
  // parseFloat() accepts a number followed by other content
  // Using both for stricter check. TODO consider using regex
  return !isNaN(parseFloat(str)) && !isNaN(Number(str));
};

utils.cleanNumber = function(str) {
  return str.replace(/,/g, '');
};

utils.parseNumber = function(str) {
  return Number(utils.cleanNumber(str));
};

MapShaper.convertRecordTypes = function(records, typeIndex) {
  var typedFields = utils.keys(typeIndex),
      converters = {
        'string': String,
        'number': utils.parseNumber
      },
      transforms = utils.map(typedFields, function(f) {
        var type = typeIndex[f],
            converter = converters[type];
        return converter;
      });
  if (typedFields.length === 0) return;
  utils.forEach(records, function(rec) {
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
