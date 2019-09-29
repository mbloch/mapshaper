/* @requires mapshaper-file-reader, mapshaper-encodings */

// Read and parse a DSV file
// This version performs field filtering before fields are extracted (faster)
// (tested with a 40GB CSV)
//
// TODO: confirm compatibility with all supported encodings
internal.readDelimRecords = function(reader, delim, optsArg) {
  var reader2 = new Reader2(reader),
      opts = optsArg || {},
      allFields = internal.readDelimHeader(reader2, delim, opts),
      rowFilter = opts.csv_filter ? internal.getDelimRecordFilterFunction(opts.csv_filter) : null,
      colFilter = opts.csv_fields ? internal.getDelimFieldFilter(allFields, opts.csv_fields) : null,
      headerArr = colFilter ? allFields.filter(function(name, i) {return colFilter(i);}) : allFields,
      convertRowArr = internal.getRowConverter(headerArr),
      batchSize = opts.batch_size || 1000,
      records = [],
      str, batch;
  if (headerArr.length === 0) return []; // e.g. empty file
  // read in batches (faster than line-by-line)
  while ((str = internal.readLinesAsString(reader2, batchSize, opts.encoding))) {
    batch = internal.parseDelimText(str, delim, convertRowArr, colFilter);
    if (rowFilter) batch = batch.filter(rowFilter);
    records.push.apply(records, batch);
    if (opts.csv_lines && records.length >= opts.csv_lines) {
      return records.slice(0, opts.csv_lines);
    }
  }
  return records;
};

// Fallback for readDelimRecords(), for encodings that do not use ascii values
// for delimiter characters and newlines. Input size is limited by the maximum
// string size. This function is also slower when using certain options.
internal.readDelimRecordsFromString = function(str, delim, opts) {
  var records = internal.parseDelimText(str, delim);
  var inputFields, colFilter;
  if (opts.csv_skip_lines > 0) {
    records.splice(0, opts.csv_skip_lines);
  }
  if (Array.isArray(opts.csv_field_names)) {
    inputFields = opts.csv_field_names;
  } else {
    inputFields = records.shift();
  }
  if (opts.csv_lines > 0) {
    records = records.splice(0, opts.csv_lines);
  }
  if (opts.csv_fields) {
    colFilter = internal.getFieldFilterMapFunction(inputFields, opts.csv_fields);
    inputFields = colFilter(inputFields);
    records = records.map(colFilter);
  }
  records = records.map(internal.getRowConverter(inputFields));
  if (opts.csv_filter) {
    records = records.filter(internal.getDelimRecordFilterFunction(opts.csv_filter));
  }
  return records;
};

internal.readDelimHeader = function(reader, delim, opts) {
  var header, fields;
  if (opts.csv_skip_lines > 0) {
    internal.skipDelimLines(reader, opts.csv_skip_lines);
  }
  if (Array.isArray(opts.csv_field_names)) {
    fields = opts.csv_field_names;
  } else {
    header = internal.readLinesAsString(reader, 1, opts.encoding);
    fields = internal.parseDelimText(header, delim)[0] || [];
  }
  return fields;
};

// Returns a function for filtering fields by column index
// The function returns true for retained fields and false for excluded fields
internal.getDelimFieldFilter = function(header, fieldsToKeep) {
  var index = utils.arrayToIndex(fieldsToKeep);
  var map = header.map(function(name) {
    return name in index;
  });
  return function(colIdx) {
    return map[colIdx];
  };
};

// Returns a function for filtering fields of an array-type record
internal.getFieldFilterMapFunction = function(header, fieldsToKeep) {
  var colFilter = internal.getDelimFieldFilter(header, fieldsToKeep);
  function filter(val, i) {
    return colFilter(i);
  }
  return function(columns) {
    return columns.filter(filter);
  };
};

internal.skipDelimLines = function(reader, lines) {
  // TODO: divide lines into batches, to prevent exceeding maximum buffer size
  var buf = reader.readSync();
  var retn = internal.readLinesFromBuffer(buf, lines);
  if (retn.bytesRead == buf.length && retn.bytesRead < reader.remaining()) {
    reader.expandBuffer(); // buffer oflo, grow the buffer and try again
    return internal.skipDelimLines(reader, lines);
  }
  reader.advance(retn.bytesRead);
};

internal.readLinesAsString = function(reader, lines, encoding) {
  var buf = reader.readSync();
  var retn = internal.readLinesFromBuffer(buf, lines);
  var str;
  if (retn.bytesRead == buf.length && retn.bytesRead < reader.remaining()) {
    // buffer overflow -- enlarge buffer and read lines again
    reader.expandBuffer();
    return internal.readLinesAsString(reader, lines, encoding);
  }
  str = retn.bytesRead > 0 ? internal.decodeString(retn.buffer, encoding) : '';
  if (reader.position() === 0) {
    str = internal.trimBOM(str);
  }
  reader.advance(retn.bytesRead);
  return str;
};

internal.readLinesFromBuffer = function(buf, linesToRead) {
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
    } else if (c == CR || c == LF) {
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
};

// Adapted from https://github.com/d3/d3-dsv
internal.getRowConverter = function(fields) {
  return new Function('arr', 'return {' + fields.map(function(name, i) {
    return JSON.stringify(name) + ': arr[' + i + '] || ""';
  }).join(',') + '}');
};

internal.parseDelimText = function(text, delim, convert, colFilter) {
  var CR = 13, LF = 10, DQUOTE = 34,
      DELIM = delim.charCodeAt(0),
      inQuotedText = false,
      capturing = false,
      srcCol = -1,
      records = [],
      fieldStart, i, c, len, record;

  if (!convert) convert = function(d) {return d;};

  function endLine() {
    records.push(convert(record));
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
};

// Returns a function for filtering records
// TODO: look into using more code from standard expressions.
internal.getDelimRecordFilterFunction = function(expression) {
  var rowFilter = internal.compileExpressionToFunction(expression, {returns: true});
  var ctx = internal.getBaseContext();
  return function(rec) {
    var val;
    try {
      val = rowFilter.call(null, rec, ctx);
    } catch(e) {
      stop(e.name, "in expression [" + exp + "]:", e.message);
    }
    if (val !== true && val !== false) {
      stop("Filter expression must return true or false");
    }
    return val;
  };
};
