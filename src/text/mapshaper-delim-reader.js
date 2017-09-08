/* @requires mapshaper-file-reader, mapshaper-encodings */

// TODO: support other encodings than utf-8
// (Need to update readDelimLines() to work with all encodings)
internal.readDelimRecords = function(reader, delim, encoding) {
  var dsv = require("d3-dsv").dsvFormat(delim),
      records = [],
      retn = internal.readDelimLines(reader, 0, delim, encoding, 1),
      header = internal.trimBOM(retn ? retn.text : '');
  // read in batches (faster than line-by-line)
  while ((retn = internal.readDelimLines(reader, retn.offset, delim, encoding, 500))) {
    records.push.apply(records, dsv.parse(header + retn.text));
  }
  return records;
};

internal.readDelimLines = function(reader, offs, delim, encoding, lines) {
  var CR = 13,
      LF = 10,
      DQUOTE = 34,
      DELIM = delim.charCodeAt(0),
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
