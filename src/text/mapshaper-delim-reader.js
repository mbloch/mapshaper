/* @requires mapshaper-file-reader, mapshaper-encodings */

// Read and parse a DSV file
// This version performs field filtering before fields are extracted (faster)
// (tested with a 40GB CSV)
//
// TODO: confirm compatibility with all supported encodings
internal.readDelimRecords = function(reader, delim, optsArg) {
  var reader2 = new Reader2(reader),
      opts = optsArg || {},
      filter = internal.getImportFilterFunction(opts),
      header = internal.trimBOM(internal.readLinesAsString(reader2, 1, opts.encoding)),
      allFields = internal.parseDelimText(header, delim)[0] || [],
      rowFilter = opts.csv_filter ? internal.getImportFilterFunction({csv_filter: opts.csv_filter}) : null,
      colFilter = opts.csv_fields ? internal.getDelimFieldFilter(allFields, opts.csv_fields) : null,
      headerArr = colFilter ? internal.parseDelimText(header, delim, null, colFilter)[0] : allFields,
      batchSize = opts.batch_size || 1000,
      convert = internal.getRowConverter(headerArr),
      records = [],
      str, batch;
  if (!header) return []; // e.g. empty file
  // read in batches (faster than line-by-line)
  while ((str = internal.readLinesAsString(reader2, batchSize, opts.encoding))) {
    batch = internal.parseDelimText(str, delim, convert, colFilter);
    if (rowFilter) batch = batch.filter(rowFilter);
    records.push.apply(records, batch);
  }
  return records;
};

// Returns a function for filtering fields by column index
// The function returns true for retained fields and false for excluded fields
internal.getDelimFieldFilter = function(header, fieldsToKeep) {
  var index = utils.arrayToIndex(fieldsToKeep);
  var map = header.map(function(name) {
    return name in index;
  });
  return function(col) {
    return map[col];
  };
};

internal.readLinesAsString = function(reader, lines, encoding) {
  var buf = reader.readSync();
  var retn = internal.readLinesFromBuffer(buf, lines);
  if (retn.bytesRead == buf.length && retn.bytesRead < reader.remaining()) {
    // buffer overflow -- enlarge buffer and read lines again
    reader.expandBuffer();
    return internal.readLinesAsString(reader, lines, encoding);
  }
  reader.advance(retn.bytesRead);
  return retn.bytesRead > 0 ? internal.decodeString(retn.buffer, encoding) : '';
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
        i++; // first half of CRLF pair; skip a char (todo: check oflo)
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
