import { isInvalidFieldName, deleteFields } from '../datatable/mapshaper-data-utils';
import { openDelimReader, readDelimRows } from '../text/mapshaper-delim-reader';
import { readFixedWidthRecordsFromString } from '../text/mapshaper-fixed-width';
import { bufferToString, encodeString } from '../text/mapshaper-encodings';
import utils from '../utils/mapshaper-utils';
import { error, message } from '../utils/mapshaper-logging';
import { DataTable } from '../datatable/mapshaper-data-table';
import { FileReader, BufferReader } from '../io/mapshaper-file-reader';
import { Buffer } from '../utils/mapshaper-node-buffer';

// Convert a string containing delimited text data into a dataset object
export function importDelim(str, opts) {
  return importDelim2({content: str}, opts);
}

// Convert a string, buffer or file containing delimited text into a dataset obj.
export function importDelim2(data, opts) {
  // TODO: remove duplication with importJSON()
  var readFromFile = !data.content && data.content !== '',
      content = data.content,
      encoding = opts && opts.encoding,
      reader, input, records, delimiter, table;
  opts = opts || {};

  if (readFromFile) {
    reader = new FileReader(data.filename);
  } else if (content instanceof ArrayBuffer || content instanceof Buffer || content instanceof Uint8Array) {
    // Web API may import as ArrayBuffer, to support larger files
    reader = new BufferReader(content);
    // BufferReader keeps its own reference; release the caller's so we
    // don't hold both the source bytes and the parsed records in memory
    // for the duration of the parse.
    data.content = null;
  } else if (utils.isString(content)) {
    reader = new BufferReader(encodeString(content, 'utf8'));
    encoding = 'utf8';
  } else {
    error("Unexpected object type");
  }

  input = openDelimReader(reader, encoding, opts);
  delimiter = guessDelimiter(bufferToString(input.reader.readSync(0, 2000)));
  if (delimiter == ' ') {
    records = readFixedWidthRecordsFromString(readAllText(input));
    adjustRecordTypes(records, opts);
  } else {
    records = readTypedDelimRecords(input, delimiter, opts);
  }
  if (records.length === 0) {
    message("Unable to read any data records");
  }
  table = new DataTable(records);
  deleteFields(table, isInvalidFieldName);
  return {
    layers: [{data: table}],
    info: {input_delimiter: delimiter}
  };
}

function readAllText(input) {
  return bufferToString(input.reader.readSync(0, Infinity), input.encoding);
}

// Read records from delimited text, converting numeric fields to numbers.
// Field types are detected as rows are read, which is much faster than a
// separate pass over the records when there are many fields.
function readTypedDelimRecords(input, delim, opts) {
  var rows = [],
      types = null;
  readDelimRows(input, delim, opts, {
    header: function(fields) {
      types = new DelimFieldTypes(fields, opts);
    },
    row: function(row) {
      types.testRow(row);
      rows.push(row);
    }
  });
  return types ? types.convertRows(rows) : [];
}

// Detects the type of each field, one row at a time (using the same rules as
// adjustRecordTypes()), then converts rows of values to records.
function DelimFieldTypes(fields, opts) {
  var typeIndex = getFieldTypeHints(opts),
      singleType = typeIndex['*'],
      parseNumber = opts.decimal_comma ? utils.parseIntlNumber : utils.parseNumber,
      columns = getRecordColumns(fields),
      numeric = [],    // true for columns that are converted to numbers
      candidates = [], // columns that may contain numbers
      hasNumber = [];  // true for candidate columns that contain a number

  columns.forEach(function(col) {
    var typeHint = typeIndex[fields[col]];
    if (typeHint == 'number' || singleType == 'number') {
      numeric[col] = true;
    } else if (typeHint != 'string' && singleType != 'string') {
      candidates.push(col);
    }
  });

  this.testRow = function(row) {
    var dropped = false, col, raw;
    for (var i=0; i<candidates.length; i++) {
      col = candidates[i];
      raw = row[col];
      if (raw === '') continue;
      if (parseNumber(raw) !== null) {
        hasNumber[col] = true;
      } else if (!isMissingValue(raw)) {
        candidates[i] = -1;
        dropped = true;
      }
    }
    if (dropped) {
      candidates = candidates.filter(function(col) { return col > -1; });
    }
  };

  this.convertRows = function(rows) {
    var detected = candidates.filter(function(col) { return hasNumber[col]; });
    detected.forEach(function(col) { numeric[col] = true; });
    if (detected.length > 0) {
      message(utils.format("Auto-detected number field%s: %s",
        detected.length == 1 ? '' : 's',
        detected.map(function(col) { return fields[col]; }).join(', ')));
    }
    // Use object-literal syntax (faster than alternative)
    var convert = new Function('row', 'parseNumber', 'return {' + columns.map(function(col) {
      var val = numeric[col] ? 'parseNumber(row[' + col + '])' : 'row[' + col + ']';
      return JSON.stringify(fields[col]) + ': ' + val;
    }).join(', ') + '}');
    for (var i=0; i<rows.length; i++) {
      rows[i] = convert(rows[i], parseNumber);
    }
    return rows;
  };
}

// Returns the column that supplies the value of each field in a record.
// If a name is repeated, the last column with the name supplies the value
// (matching an object literal with a repeated key).
function getRecordColumns(fields) {
  var index = new Map();
  fields.forEach(function(name, col) {
    index.set(name, col); // Map keeps the insertion order of the first occurrence
  });
  return Array.from(index.values());
}

// Empty values and NA values (e.g. from R) are allowed in numeric fields
function isMissingValue(raw) {
  var str = raw ? raw.trim() : '';
  return str.length === 0 || str == 'NA' || str == 'NaN';
}

var supportedDelimiters = ['|', '\t', ',', ';', ' '];

export function isSupportedDelimiter(d) {
  return utils.contains(supportedDelimiters, d);
}

export function guessDelimiter(content) {
  return utils.find(supportedDelimiters, function(delim) {
    var rxp = getDelimiterRxp(delim);
    return rxp.test(content);
  }) || ',';
}

// Get RegExp to test for a delimiter before first line break of a string
// Assumes that the first line does not contain alternate delim chars (this will
// be true if the first line has field headers composed of word characters).
function getDelimiterRxp(delim) {
  var rxp = "^[^\\n\\r]+" + utils.regexEscape(delim);
  return new RegExp(rxp);
}

export function getFieldTypeHints(opts) {
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
        type = validateFieldType(parts[1]);
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
}


// Detect and convert data types of data from csv files.
// TODO: decide how to handle records with inconstent properties. Mapshaper
//    currently assumes tabular data
export function adjustRecordTypes(records, optsArg) {
  var opts = optsArg || {},
      typeIndex = getFieldTypeHints(opts),
      singleType = typeIndex['*'], // support for setting all fields to a single type
      fields = Object.keys(records[0] || []),
      detectedNumFields = [],
      parseNumber = opts.decimal_comma ? utils.parseIntlNumber : utils.parseNumber,
      replacements = {};
  fields.forEach(function(key) {
    var typeHint = typeIndex[key];
    var values = null;
    if (typeHint == 'number' || singleType == 'number') {
      values = convertDataField(key, records, parseNumber);
    } else if (typeHint == 'string' || singleType == 'string') {
      // We should be able to assume that imported CSV fields are strings,
      //   so parsing + replacement is not required
      // values = internal.convertDataField(key, records, utils.parseString);
      values = null;
    } else {
      values = tryNumericField(key, records, parseNumber);
      if (values) detectedNumFields.push(key);
    }
    if (values) replacements[key] = values;
  });
  if (Object.keys(replacements).length > 0) {
    updateFieldsInRecords(fields, records, replacements);
  }
  if (detectedNumFields.length > 0) {
    message(utils.format("Auto-detected number field%s: %s",
        detectedNumFields.length == 1 ? '' : 's', detectedNumFields.join(', ')));
  }
}

// Copy original data properties and replacements to a new set of records
// (Better performance in v8 than making in-place replacements)
function updateFieldsInRecords(fields, records, replacements) {
  // Use object-literal syntax (faster than alternative)
  var convertBody = 'return {' + fields.map(function(name) {
      var key = JSON.stringify(name);
      return key + ': ' + (replacements[name] ? 'replacements[' + key + '][i]' : 'rec[' + key + ']');
    }).join(', ') + '}';
  var convert = new Function('rec', 'replacements', 'i', convertBody);
  records.forEach(function(rec, i) {
    records[i] = convert(rec, replacements, i);
  });
}

function tryNumericField(key, records, parseNumber) {
  var arr = [],
      count = 0,
      raw, num;
  for (var i=0, n=records.length; i<n; i++) {
    raw = records[i][key];
    num = parseNumber(raw);
    if (num === null) {
      if (!isMissingValue(raw)) {
        return null; // unparseable value -- fail
      }
    } else {
      count++;
    }
    arr.push(num);
  }
  return count > 0 ? arr : null;
}

function convertDataField(name, records, f) {
  var values = [];
  for (var i=0, n=records.length; i<n; i++) {
    values.push(f(records[i][name]));
  }
  return values;
}

// Accept a type hint from a header like "FIPS:str"
// Return standard type name (number|string) or null if hint is not recognized
function validateFieldType(hint) {
  var str = hint.toLowerCase(),
      type = null;
  if (str[0] == 'n') {
    type = 'number';
  } else if (str[0] == 's') {
    type = 'string';
  }
  return type;
}

