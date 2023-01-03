import { isInvalidFieldName, deleteFields } from '../datatable/mapshaper-data-utils';
import { readDelimRecordsFromString, readDelimRecords } from '../text/mapshaper-delim-reader';
import { encodingIsAsciiCompat, trimBOM } from '../text/mapshaper-encodings';
import { detectEncodingFromBOM } from '../text/mapshaper-encoding-detection';
import utils from '../utils/mapshaper-utils';
import { error, message } from '../utils/mapshaper-logging';
import { DataTable } from '../datatable/mapshaper-data-table';
import { readFirstChars, FileReader, BufferReader } from '../io/mapshaper-file-reader';
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
      reader, records, delimiter, table, encoding;
  opts = opts || {};

  // // read content of all but very large files into a buffer
  // if (readFromFile && cli.fileSize(data.filename) < 2e9) {
  //   content = cli.readFile(data.filename);
  //   readFromFile = false;
  // }

  if (readFromFile) {
    reader = new FileReader(data.filename);
  } else if (content instanceof ArrayBuffer || content instanceof Buffer || content instanceof Uint8Array) {
    // Web API may import as ArrayBuffer, to support larger files
    reader = new BufferReader(content);
    content = null;
  } else if (utils.isString(content)) {
    // import as string
  } else {
    error("Unexpected object type");
  }

  if (reader) {
    encoding = detectEncodingFromBOM(reader.readSync(0, Math.min(reader.size(), 3)));
    // Files in some encodings have to be converted to strings before parsing
    // Other encodings are similar enough to ascii that CSV can be parsed
    // byte-by-byte.
    if (encoding == 'utf16be' || encoding == 'utf16le') {
      content = trimBOM(reader.toString(encoding));
      reader = null;
    } else if (opts.encoding && !encodingIsAsciiCompat(opts.encoding)) {
      content = reader.toString(opts.encoding);
      reader = null;
    }
  }

  if (reader) {
    delimiter = guessDelimiter(readFirstChars(reader, 2000));
    records = readDelimRecords(reader, delimiter, opts);
  } else {
    delimiter = guessDelimiter(content);
    records = readDelimRecordsFromString(content, delimiter, opts);
  }
  if (records.length === 0) {
    message("Unable to read any data records");
  }
  adjustRecordTypes(records, opts);
  table = new DataTable(records);
  deleteFields(table, isInvalidFieldName);
  return {
    layers: [{data: table}],
    info: {input_delimiter: delimiter}
  };
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
      raw, str, num;
  for (var i=0, n=records.length; i<n; i++) {
    raw = records[i][key];
    num = parseNumber(raw);
    if (num === null) {
      str = raw ? raw.trim() : '';
      if (str.length > 0 && str != 'NA' && str != 'NaN') { // ignore NA values ("NA" seen in R output)
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

