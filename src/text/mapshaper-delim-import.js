/* @requires mapshaper-data-table, mapshaper-data-utils, mapshaper-delim-reader */


// Convert a string containing delimited text data into a dataset object
internal.importDelim = function(str, opts) {
  return internal.importDelim2({content: str}, opts);
};

internal.importDelim2 = function(data, opts) {
  // TODO: remove duplication with importJSON()
  var content = data.content,
      reader, records, delimiter, table;

  if (!content) {
    reader = new FileReader(data.filename);
  } else if (content instanceof ArrayBuffer || content instanceof Buffer) {
    // Web API may import as ArrayBuffer, to support larger files
    reader = new BufferReader(content);
    content = null;
  } else if (!utils.isString(content)) {
    error("Unexpected object type");
  }

  if (reader && !internal.encodingIsAsciiCompat(opts.encoding)) {
    // Currently, incremental reading assumes ascii-compatible data.
    // Incompatible encodings must be parsed as strings.
    content = reader.toString(opts.encoding);
    reader = null;
  }

  if (reader) {
    delimiter = internal.guessDelimiter(internal.readFirstChars(reader, 2000));
    records = internal.readDelimRecords(reader, delimiter, opts.encoding);
  } else {
    delimiter = internal.guessDelimiter(content);
    records = require("d3-dsv").dsvFormat(delimiter).parse(content);
    delete records.columns; // added by d3-dsv
  }
  if (records.length === 0) {
    stop("Unable to read any data records");
  }
  internal.adjustRecordTypes(records, opts);
  table = new DataTable(records);
  internal.deleteFields(table, internal.isInvalidFieldName);
  return {
    layers: [{data: table}],
    info: {input_delimiter: delimiter}
  };
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

internal.getFieldTypeHints = function(opts) {
  var hints = {};
  opts = opts || {};
  if (opts.string_fields) {
    opts.string_fields.forEach(function(f) {
      hints[f] = 'string';
    });
  }
  if (opts.field_types) {
    opts.field_types.forEach(function(raw) {
      var parts, name, type;
      if (raw.indexOf(':') != -1) {
        parts = raw.split(':');
        name = parts[0];
        type = internal.validateFieldType(parts[1]);
      } else if (raw[0] === '+') { // d3-style type hint: unary plus
        name = raw.substr(1);
        type = 'number';
      }
      if (type) {
        hints[name] = type;
      } else {
        message("Invalid type hint (expected :str or :num) [" + raw + "]");
      }
    });
  }
  return hints;
};

// Detect and convert data types of data from csv files.
// TODO: decide how to handle records with inconstent properties. Mapshaper
//    currently assumes tabular data
internal.adjustRecordTypes = function(records, opts) {
  var typeIndex = internal.getFieldTypeHints(opts),
      fields = Object.keys(records[0] || []),
      detectedNumFields = [];
  fields.forEach(function(key) {
    var typeHint = typeIndex[key];
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
