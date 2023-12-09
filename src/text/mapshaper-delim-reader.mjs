import { trimBOM, decodeString } from '../text/mapshaper-encodings';
import { getExpressionFunction } from '../expressions/mapshaper-expressions';
import { requireBooleanResult } from '../expressions/mapshaper-expression-utils';
import utils from '../utils/mapshaper-utils';
import { stop } from '../utils/mapshaper-logging';
import { Reader2 } from '../io/mapshaper-file-reader';
import { readFixedWidthRecords, readFixedWidthRecordsFromString } from '../text/mapshaper-fixed-width';

// Read and parse a DSV file
// This version performs field filtering before fields are extracted (faster)
// (tested with a 40GB CSV)
//
// TODO: confirm compatibility with all supported encodings
export function readDelimRecords(reader, delim, optsArg) {
  var opts = optsArg || {};
  if (delim == ' ') return readFixedWidthRecords(reader, opts);
  var reader2 = new Reader2(reader),
      headerStr = readLinesAsString(reader2, getDelimHeaderLines(opts), opts.encoding),
      header = parseDelimHeaderSection(headerStr, delim, opts),
      convertRowArr = getRowConverter(header.import_fields),
      batchSize = opts.batch_size || 1000,
      records = [],
      str, batch;
  if (header.import_fields.length === 0) return []; // e.g. empty file
  // read in batches (faster than line-by-line)
  while ((str = readLinesAsString(reader2, batchSize, opts.encoding))) {
    batch = parseDelimText(str, delim, convertRowArr, header.column_filter || false, header.row_filter || false);
    records.push.apply(records, batch);
    if (opts.csv_lines && records.length >= opts.csv_lines) {
      return records.slice(0, opts.csv_lines);
    }
  }
  return records;
}

// Fallback for readDelimRecords(), for encodings that do not use ascii values
// for delimiter characters and newlines. Input size is limited by the maximum
// string size.
export function readDelimRecordsFromString(str, delim, opts) {
  if (delim == ' ') return readFixedWidthRecordsFromString(str, opts);
  var header = parseDelimHeaderSection(str, delim, opts);
  if (header.import_fields.length === 0 || !header.remainder) return [];
  var convert = getRowConverter(header.import_fields);
  var records = parseDelimText(header.remainder, delim, convert, header.column_filter, header.row_filter);
  if (opts.csv_lines > 0) {
    // TODO: don't parse unneeded rows
    records = records.slice(0, opts.csv_lines);
  }
  return records;
}

// Get index in string of the nth line
// line numbers are 1-based (first line is 1)
export function indexOfLine(str, nth) {
  var rxp = /\r\n|[\r\n]|.$/g; // dot prevents matching end of string twice
  var i = 1;
  if (nth === 1) return 0;
  if (nth > 1 === false) return -1;
  while (rxp.exec(str)) {
    i++;
    if (i < nth === false) return rxp.lastIndex;
  }
  return -1;
}

function getDelimHeaderLines(opts) {
  var skip = opts.csv_skip_lines || 0;
  if (!opts.csv_field_names) skip++;
  return skip;
}

// Adapted from https://github.com/d3/d3-dsv
export function getRowConverter(fields) {
  return new Function('arr', 'return {' + fields.map(function(name, i) {
    return JSON.stringify(name) + ': arr[' + i + '] || ""';
  }).join(',') + '}');
}

export function parseDelimHeaderSection(str, delim, opts) {
  var nodata = {headers: [], import_fields: []},
      retn = {},
      i;
  str = str || '';
  if (opts.csv_skip_lines > 0) {
    i = indexOfLine(str, opts.csv_skip_lines + 1);
    if (i === -1) return nodata;
    str = str.substr(i);
  }
  if (opts.csv_field_names) {
    retn.headers = opts.csv_field_names;
  } else {
    i = indexOfLine(str, 2);
    if (i === -1) return nodata;
    retn.headers = parseDelimText(str.slice(0, i), delim)[0];
    str = str.substr(i);
  }
  if (opts.csv_dedup_fields) {
    retn.headers = utils.uniqifyNames(retn.headers);
  }
  if (opts.csv_filter) {
    retn.row_filter = getDelimRecordFilterFunction(opts.csv_filter);
  }
  if (opts.csv_fields) {
    retn.column_filter = getDelimFieldFilter(retn.headers, opts.csv_fields);
    retn.import_fields = retn.headers.filter(function(name, i) {return retn.column_filter(i);});
  } else {
    retn.import_fields = retn.headers;
  }
  retn.remainder = str;
  return retn;
}

// Returns a function for filtering records
// TODO: look into using more code from standard expressions.
function getDelimRecordFilterFunction(expression) {
  var rowFilter = getExpressionFunction(expression);
  return function(rec) {
    var val = rowFilter(rec);
    requireBooleanResult(val);
    return val;
  };
}

// Returns a function for filtering fields by column index
// The function returns true for retained fields and false for excluded fields
export function getDelimFieldFilter(header, fieldsToKeep) {
  var index = utils.arrayToIndex(fieldsToKeep);
  var map = header.map(function(name) {
    return name in index;
  });
  var missing = utils.difference(fieldsToKeep, header);
  if (missing.length > 0) {
    var foundStr = [''].concat(header).join('\n  ');
    var missingStr = [''].concat(missing).join('\n  ');
    stop('csv-fields option has', missing.length == 1 ? 'a name' : missing.length + ' names',  'not found in the file\nFields:', foundStr, '\nMissing:', missingStr);
  }
  return function(colIdx) {
    return map[colIdx];
  };
}

// May be useful in the future to implement reading a range of CSV records
function skipDelimLines(reader, lines) {
  // TODO: divide lines into batches, to prevent exceeding maximum buffer size
  var buf = reader.readSync();
  var retn = readLinesFromBuffer(buf, lines);
  if (retn.bytesRead == buf.length && retn.bytesRead < reader.remaining()) {
    reader.expandBuffer(); // buffer oflo, grow the buffer and try again
    return skipDelimLines(reader, lines);
  }
  reader.advance(retn.bytesRead);
}

export function readLinesAsString(reader, lines, encoding) {
  var buf = reader.readSync();
  var retn = readLinesFromBuffer(buf, lines);
  var str;
  if (retn.bytesRead == buf.length && retn.bytesRead < reader.remaining()) {
    // buffer overflow -- enlarge buffer and read lines again
    reader.expandBuffer();
    return readLinesAsString(reader, lines, encoding);
  }
  // str = retn.bytesRead > 0 ? retn.buffer.toString('ascii', 0, retn.bytesRead) : '';
  str = retn.bytesRead > 0 ? decodeString(retn.buffer, encoding) : '';
  if (reader.position() === 0) {
   str = trimBOM(str);
  }
  reader.advance(retn.bytesRead);
  return str;
}

function readLinesFromBuffer(buf, linesToRead) {
  var CR = 13, LF = 10, DQUOTE = 34,
      inQuotedText = false,
      lineCount = 0,
      bufLen = buf.length,
      i, c;

  lineCount++;
  for (i=0; i < bufLen && lineCount <= linesToRead; i++) {
    c = buf[i];
    if (c == DQUOTE) {
      inQuotedText = !inQuotedText;
    } else if ((c == CR || c == LF) && !inQuotedText) {
      if (c == CR && i + 1 < bufLen && buf[i + 1] == LF) {
        // first half of CRLF pair: advance one byte
        i++;
      }
      lineCount++;
    }
  }
  return {
    bytesRead: i,
    buffer: buf.slice(0, i)
  };
}

// Convert a string of CSV data into an array of data records
// convert: optional function for converting an array record to an object record (values indexed by field names)
// colFilter: optional function for filtering columns by numerical column id (0-based); accepts an array record and an id
// rowFilter: optional function for filtering rows; accepts a record in object format
export function parseDelimText(text, delim, convert, colFilter, rowFilter) {
  var CR = 13, LF = 10, DQUOTE = 34,
      DELIM = delim.charCodeAt(0),
      inQuotedText = false,
      capturing = false,
      srcCol = -1,
      records = [],
      fieldStart, i, c, len, record;

  if (!convert) convert = function(d) {return d;};

  function endLine() {
    var rec = convert ? convert(record) : record;
    if (!rowFilter || rowFilter(rec)) records.push(rec);
    srcCol = -1;
  }

  function startFieldAt(j) {
    fieldStart = j;
    srcCol++;
    if (srcCol === 0) record = [];
    if (!colFilter || colFilter(srcCol)) {
      capturing = true;
    }
  }

  function captureField(start, end) {
    var s;
    if (!capturing) return;
    capturing = false;
    if (start === end) {
      s = '';
    } else if (text.charCodeAt(start) == DQUOTE) {
      s = text.slice(start+1, end-1).replace(/""/g, '"');
    } else {
      s = text.slice(start, end);
    }
    record.push(s);
  }

  startFieldAt(0);
  for (i=0, len=text.length; i < len; i++) {
    c = text.charCodeAt(i);
    if (c == DQUOTE) {
      inQuotedText = !inQuotedText;
    } else if (inQuotedText) {
      //
    } else if (c == DELIM) {
      captureField(fieldStart, i);
      startFieldAt(i + 1);
    } else if (c == CR || c == LF) {
      captureField(fieldStart, i);
      endLine();
      if (c == CR && text.charCodeAt(i+1) == LF) {
        i++; // first half of CRLF pair; skip a char
      }
      if (i + 1 < len) startFieldAt(i+1);
    }
  }

  if (srcCol > -1) { // finish last line (if file ends without newline)
    if (capturing) captureField(fieldStart, i);
    endLine();
  }

  return records;
}
