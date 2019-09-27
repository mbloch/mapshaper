/* @requires mapshaper-file-reader, mapshaper-encodings */

// Read and parse a DSV file
// This function parses delimited text files 500 lines at a time, which
// avoids reading the file as a single string (which limits the allowable
// file size to as little as 256MB, depending on the JS engine).
//
// TODO: support other encodings than utf-8
// (Need to update readDelimLines() to work with all encodings)
internal.readDelimRecords = function(reader, delim, optsArg) {
  var dsv = require("d3-dsv").dsvFormat(delim),
      opts = optsArg || {},
      encoding = opts.encoding,
      filter = internal.getImportFilterFunction(opts),
      records = [],
      retn = internal.readDelimLines(reader, 0, encoding, 1),
      header = internal.trimBOM(retn ? retn.text : ''),
      batchSize = opts.batch_size || 500,
      batch;
  if (!retn) return []; // e.g. empty file
  // read in batches (faster than line-by-line)
  while ((retn = internal.readDelimLines(reader, retn.offset, encoding, batchSize))) {
    batch = dsv.parse(header + retn.text, filter);
    records.push.apply(records, batch);
  }
  return records;
};

internal.readDelimLines = function(reader, offs, encoding, lines) {
  var CR = 13,
      LF = 10,
      DQUOTE = 34,
      inQuotedField = false,
      buf = reader.readSync(offs),
      eol = false,
      linesLeft = lines > 0 ? lines : 1,
      i, n, c, prev;

  for (i=0, n=buf.length; i<n; i++) {
    c = buf[i];
    if (eol) {
      if (prev == CR && c == LF) {
        // consume LF
      } else {
        eol = false;
        linesLeft--;
      }
      if (linesLeft <= 0) break;
    }
    if (c == DQUOTE) {
      // according to spec, double quotes either enclose a field or are
      // paired inside a quoted field
      // https://tools.ietf.org/html/rfc4180
      // the following handles both cases (no error checking though)
      inQuotedField = !inQuotedField;
    } else if (!inQuotedField && (c == CR || c == LF)) {
      eol = true;
    }

    if (i == n-1) {
      buf = reader.expandBuffer().readSync(offs);
      n = buf.length;
    }
    prev = c;
  }
  return i === 0 ? null : {
    offset: i + offs,
    text: internal.bufferToString(buf, encoding, 0, i)
  };
};

// Read and parse a DSV file
// This version performs field filtering at a low level (before parsing with d3),
// which improves performance when filtering out many fields from a large file.
// (tested with a 40GB CSV)
//
// TODO: support other encodings than utf-8 and ascii
// (Need to update readDelimLines() to work with all encodings)
internal.readDelimRecords2 = function(reader, delim, optsArg) {
  var dsv = require("d3-dsv").dsvFormat(delim),
      opts = optsArg || {},
      records = [],
      inputBuf = reader.readSync(0),
      retn = internal.readDelimLines2(inputBuf, 1, delim), // read one line (assumed to contain field names)
      fullHeader = internal.trimBOM(retn.bytesRead ? internal.decodeString(retn.buffer, opts.encoding) : ''),
      allFields = dsv.parseRows(fullHeader)[0] || [],
      rowFilter = opts.csv_filter ? internal.getImportFilterFunction({csv_filter: opts.csv_filter}) : null,
      colFilter = opts.csv_fields ? internal.getDelimFieldFilter(allFields, opts.csv_fields) : null,
      headerStr = colFilter ? internal.filterHeaderFields(allFields, colFilter).join(delim) + '\n' : fullHeader,
      fileOffset = retn.bytesRead,
      batchSize = opts.batch_size || 1000,
      batch, dataStr;

  if (!headerStr) return []; // e.g. empty file

  while (fileOffset < reader.size()) {
    inputBuf = reader.readSync(fileOffset);
    retn = internal.readDelimLines2(inputBuf, batchSize, delim, colFilter); // read in 1000-line chunks
    if (retn.bytesRead > 0 === false) error('Error reading file'); // should never happen
    if (retn.bytesRead >= inputBuf.length && reader.size() > fileOffset + retn.bytesRead) {
      // if the input buffer overflows, enlarge it and re-read these lines
      reader.expandBuffer();
      continue;
    }
    dataStr = internal.decodeString(retn.buffer, opts.encoding);
    batch = dsv.parse(headerStr + dataStr, rowFilter);
    records.push.apply(records, batch);
    fileOffset += retn.bytesRead;
  }
  return records;
};

internal.filterHeaderFields = function(fields, colFilter) {
  return fields.filter(function(name, i) {
    return colFilter ? colFilter(i) : true;
  });
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

internal.readDelimLines2 = (function() {
  var getOutputBuffer = utils.expandoBuffer();

  function peekNextByte(buf, i) {
    i++;
    return i < buf.length ? buf[i] : 0;
  }

  return function(srcBuf, lines, delim, keepField) {
    var CR = 13, LF = 10, DQUOTE = 34,
        DELIM = delim.charCodeAt(0),
        inQuotedField = false,
        inExcludedField = false,
        linesToRead = lines > 0 ? lines : 1,
        lineCount = 0,
        bufLen = srcBuf.length,
        // use a separate buffer for output if filtering fields (data corruption can occur)
        destBuf = keepField ? getOutputBuffer(bufLen) : srcBuf,
        i, j, c, keepChar, srcCol, destCol;

    function startLine() {
      srcCol = -1;
      destCol = -1;
      lineCount++;
      startSourceField();
    }

    function startSourceField() {
      srcCol++;
      if (!keepField || keepField(srcCol)) {
        inExcludedField = false;
        destCol++;
      } else {
        inExcludedField = true;
      }
    }

    startLine();
    for (i=0, j=0; i < bufLen && lineCount <= linesToRead; i++) {
      c = srcBuf[i];
      if (c == DQUOTE) {
        // according to spec, double quotes either enclose a field or are
        // paired inside a quoted field
        // https://tools.ietf.org/html/rfc4180
        // the following handles both cases (no error checking though)
        inQuotedField = !inQuotedField;
      }

      if (inQuotedField) {
        keepChar = !inExcludedField;
      } else if (c == CR || c == LF) {
        keepChar = true;
        if (c == CR && peekNextByte(srcBuf, i) == LF) {
          // first half of CRLF pair: don't start a new line yet
        } else {
          startLine();
        }
      } else if (c == DELIM) {
        startSourceField();
        keepChar = !inExcludedField && destCol > 0;
      } else {
        keepChar = !inExcludedField;
      }

      if (keepChar) destBuf[j++] = c;
    }

    return {
      bytesRead: i,
      buffer: destBuf.slice(0, j)
    };
  };
}());

function objectConverter(columns) {
  return new Function("d", "return {" + columns.map(function(name, i) {
    return JSON.stringify(name) + ": d[" + i + "] || \"\"";
  }).join(",") + "}");
}
