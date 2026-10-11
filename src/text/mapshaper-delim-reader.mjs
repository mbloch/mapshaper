import { decodeString, encodeString, encodingIsUtf8, isSingleByteAsciiEncoding } from '../text/mapshaper-encodings';
import { detectEncodingFromBOM } from '../text/mapshaper-encoding-detection';
import { getExpressionFunction } from '../expressions/mapshaper-expressions';
import { requireBooleanResult } from '../expressions/mapshaper-expression-utils';
import utils from '../utils/mapshaper-utils';
import { stop } from '../utils/mapshaper-logging';
import { BufferReader, TranscodingReader } from '../io/mapshaper-file-reader';
import { readFixedWidthRecords, readFixedWidthRecordsFromString } from '../text/mapshaper-fixed-width';

// Delimited text is parsed directly from bytes, in large chunks. This works for
// UTF-8 and for single-byte encodings that are supersets of ascii, because
// delimiters, quotes and line breaks are always single ascii bytes. Text in
// other encodings (e.g. UTF-16, Big5) is converted to UTF-8 as it is read.
// Only the values of imported fields are converted to strings.

var CR = 13, LF = 10, DQUOTE = 34;
var DEFAULT_CHUNK_SIZE = 0x1000000; // 16MB

// Read and parse a DSV file, returning records with string values
export function readDelimRecords(reader, delim, optsArg) {
  var opts = optsArg || {};
  if (delim == ' ') return readFixedWidthRecords(reader, opts);
  var input = openDelimReader(reader, opts.encoding, opts),
      rows = [],
      fields = null;
  readDelimRows(input, delim, opts, {
    header: function(names) { fields = names; },
    row: function(row) { rows.push(row); }
  });
  if (!fields) return [];
  var convert = getRowConverter(fields);
  for (var i=0; i<rows.length; i++) {
    rows[i] = convert(rows[i]);
  }
  return rows;
}

export function readDelimRecordsFromString(str, delim, opts) {
  if (delim == ' ') return readFixedWidthRecordsFromString(str, opts);
  var reader = new BufferReader(encodeString(str, 'utf8'));
  return readDelimRecords(reader, delim, Object.assign({}, opts, {encoding: 'utf8'}));
}

// Returns {reader, encoding}, where reader returns bytes that can be parsed
// as ascii, and encoding is the encoding to use for converting values to strings.
// A UTF-16 BOM overrides the @encoding argument.
export function openDelimReader(reader, encoding, opts) {
  var bom = detectEncodingFromBOM(reader.readSync(0, Math.min(reader.size(), 3)));
  if (bom == 'utf16le' || bom == 'utf16be') {
    encoding = bom;
  }
  encoding = encoding || 'utf8';
  if (encodingIsUtf8(encoding) || isSingleByteAsciiEncoding(encoding)) {
    return {reader: reader, encoding: encoding};
  }
  return {
    reader: new TranscodingReader(reader, encoding, {chunkSize: opts && opts.chunk_size}),
    encoding: 'utf8'
  };
}

// Parse delimited text from a reader returned by openDelimReader().
// consumer.header(fields) receives the names of the imported fields.
// consumer.row(row) receives an array of string values for each data row.
export function readDelimRows(input, delim, opts, consumer) {
  var parser = getDelimLineParser(delim, input.encoding),
      linesToSkip = opts.csv_skip_lines || 0,
      maxRows = opts.csv_lines > 0 ? opts.csv_lines : Infinity,
      rowCount = 0,
      fields = null,
      fieldCount, toRecord, rowFilter;

  if (opts.csv_field_names) {
    initFields(opts.csv_field_names);
  }

  readLines(input, parser, opts.chunk_size || DEFAULT_CHUNK_SIZE, function(values, count) {
    if (linesToSkip > 0) {
      linesToSkip--;
      return true;
    }
    if (!fields) {
      initFields(values.slice(0, count));
      return true;
    }
    var row = values.slice(0, count);
    for (var i=count; i<fieldCount; i++) {
      row.push('');
    }
    if (rowFilter && !rowFilter(toRecord(row))) {
      return true;
    }
    consumer.row(row);
    return ++rowCount < maxRows;
  });

  function initFields(headers) {
    var colFilter;
    if (opts.csv_dedup_fields) {
      headers = utils.uniqifyNames(headers);
    }
    if (opts.csv_fields) {
      colFilter = getDelimFieldFilter(headers, opts.csv_fields);
      fields = headers.filter(function(name, i) { return colFilter(i); });
      parser.setColumns(headers.map(function(name, i) { return colFilter(i); }));
    } else {
      fields = headers;
      parser.setColumns(headers.map(function() { return true; }));
    }
    fieldCount = fields.length;
    if (opts.csv_filter) {
      rowFilter = getDelimRecordFilterFunction(opts.csv_filter);
      toRecord = getRowConverter(fields);
    }
    consumer.header(fields);
  }
}

// Read chunks of bytes and parse the complete lines in each chunk.
// onLine(values, count) receives the values of each line; it returns false to stop reading.
function readLines(input, parser, chunkSize, onLine) {
  var reader = input.reader,
      pos = startsWithUtf8BOM(input) ? 3 : 0,
      stopped = false,
      buf, isLast, bytesParsed;
  while (!stopped) {
    buf = reader.readSync(pos, chunkSize);
    if (buf.length === 0) break;
    isLast = buf.length < chunkSize;
    bytesParsed = parser.parseLines(buf, isLast, function(values, count) {
      stopped = onLine(values, count) === false;
      return !stopped;
    });
    if (isLast) break;
    if (bytesParsed === 0 && !stopped) {
      chunkSize *= 2; // the chunk contains part of a single line
    }
    pos += bytesParsed;
  }
}

function startsWithUtf8BOM(input) {
  return encodingIsUtf8(input.encoding) &&
    detectEncodingFromBOM(input.reader.readSync(0, 3)) == 'utf8';
}

// Returns a parser for lines of delimited text in a Buffer.
// Like the earlier string-based parser, a quote mark anywhere in a field
// toggles quoted text, and a field that starts with a quote mark is unquoted.
function getDelimLineParser(delim, encoding) {
  var DELIM = delim.charCodeAt(0),
      decode = getValueDecoder(encoding),
      keep = null, // flags for columns to keep, or null to keep all columns
      skipFrom = Infinity, // column after the last kept column
      values = [],
      count = 0, // number of values in the current line
      buf, end, isLast,
      nextQuote, nextCR, nextLF; // cached positions of the next quote and line break bytes

  // flags: array of booleans, indexed by column number
  function setColumns(flags) {
    keep = flags;
    skipFrom = flags.lastIndexOf(true) + 1;
  }

  // Parse the complete lines in a buffer, calling onLine(values, count) for each line.
  // isLastChunk: true if the buffer extends to the end of the text (so a final
  //   line without a line break is complete)
  // Returns the number of bytes parsed.
  function parseLines(buffer, isLastChunk, onLine) {
    var pos = 0, next;
    buf = buffer;
    end = buf.length;
    isLast = isLastChunk;
    nextQuote = nextCR = nextLF = -1;
    while (pos < end) {
      next = parseLine(pos);
      if (next == -1) break; // incomplete line
      pos = next;
      if (!onLine(values, count)) break;
    }
    return pos;
  }

  // Parse a line starting at byte i.
  // Returns the position of the next line, or -1 if the line is incomplete.
  function parseLine(i) {
    // local copies of shared variables are faster in the loop
    var bytes = buf,
        n = end,
        delimByte = DELIM,
        flags = keep,
        keepAll = flags === null,
        skipCol = skipFrom,
        col = 0,
        fieldStart = i,
        inQuotes = false,
        c, eol;
    count = 0;
    while (i < n) {
      c = bytes[i];
      if (c > DQUOTE && c != delimByte) {
        i++; // ordinary character (most common case)
      } else if (inQuotes) {
        if (c == DQUOTE) inQuotes = false;
        i++;
      } else if (c == DQUOTE) {
        inQuotes = true;
        i++;
      } else if (c == delimByte) {
        if (keepAll || flags[col] === true) values[count++] = readValue(fieldStart, i);
        fieldStart = ++i;
        if (++col == skipCol) {
          // All kept fields have been read; try to skip the rest of the line
          eol = findUnquotedLineBreak(i);
          if (eol > -1) return endLine(eol);
        }
      } else if (c == CR || c == LF) {
        if (keepAll || flags[col] === true) values[count++] = readValue(fieldStart, i);
        return endLine(i);
      } else {
        i++;
      }
    }
    if (!isLast) return -1;
    // final line has no line break
    if (keepAll || flags[col] === true) values[count++] = readValue(fieldStart, i);
    return n;
  }

  // i: position of a CR or LF
  // Returns the position after the line break, or -1 if a CRLF might be split
  // by the end of the buffer
  function endLine(i) {
    if (buf[i] == LF) return i + 1;
    if (i + 1 < end) return buf[i + 1] == LF ? i + 2 : i + 1;
    return isLast ? i + 1 : -1;
  }

  // Returns the position of the line break at the end of the line containing
  // byte i, or -1 if a quote mark comes first (the line break might be quoted
  // text) or the line continues past the end of the buffer.
  // Positions are cached, so successive searches don't re-scan the same bytes.
  function findUnquotedLineBreak(i) {
    if (nextLF < i) nextLF = indexOfByte(LF, i);
    if (nextCR < i) nextCR = indexOfByte(CR, i);
    var eol = nextLF < nextCR ? nextLF : nextCR;
    if (eol == end) return -1;
    if (nextQuote < i) nextQuote = indexOfByte(DQUOTE, i);
    return nextQuote < eol ? -1 : eol;
  }

  function indexOfByte(c, i) {
    var j = buf.indexOf(c, i);
    return j == -1 ? end : j;
  }

  function readValue(i, j) {
    if (i == j) return '';
    if (buf[i] == DQUOTE) {
      // remove enclosing quotes and unescape doubled quotes
      // (a malformed value may be missing the closing quote)
      var str = decode(buf, i + 1, j - i > 1 && buf[j - 1] == DQUOTE ? j - 1 : j);
      return str.indexOf('"') > -1 ? str.replace(/""/g, '"') : str;
    }
    return decode(buf, i, j);
  }

  return {
    setColumns: setColumns,
    parseLines: parseLines
  };
}

// Returns a function for converting a range of bytes to a string
function getValueDecoder(encoding) {
  // ignoreBOM: a value that starts with U+FEFF keeps it
  var utf8 = new TextDecoder('utf-8', {ignoreBOM: true});
  var decodeNonAscii = encodingIsUtf8(encoding) ?
    function(buf, start, end) { return utf8.decode(buf.subarray(start, end)); } :
    function(buf, start, end) { return decodeString(buf.subarray(start, end), encoding); };
  return function(buf, start, end) {
    for (var i=start; i<end; i++) {
      if (buf[i] > 127) return decodeNonAscii(buf, start, end);
    }
    return buf.toString('latin1', start, end);
  };
}

// Parse a string of delimited text into arrays of values (one array per line)
export function parseDelimText(text, delim) {
  var parser = getDelimLineParser(delim, 'utf8'),
      rows = [];
  parser.parseLines(encodeString(text, 'utf8'), true, function(values, count) {
    rows.push(values.slice(0, count));
    return true;
  });
  return rows;
}

// Adapted from https://github.com/d3/d3-dsv
export function getRowConverter(fields) {
  return new Function('arr', 'return {' + fields.map(function(name, i) {
    return JSON.stringify(name) + ': arr[' + i + '] || ""';
  }).join(',') + '}');
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
