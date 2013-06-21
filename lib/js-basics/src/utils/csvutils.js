/* @requires textutils */

// Gets a function to convert a delimited line into parts
//
Utils.delimLineParser = function(sep) {
  //var splitRxp = /,(?=(?:[^"]*"[^"]*")*(?![^"]*"))/;
  var splitRxp = new RegExp(sep + '(?=(?:[^"]*"[^"]*")*(?![^"]*"))');

  function unescape(s) {
    var len = s.length;
    if (s[0] == '"' && s[len-1] == '"') {
      s = s.substr(1, len-2);
    }
    return s.replace(/""/g, '"');
  }

  return function(s) {
    var parts = s.split(splitRxp);
    for (var i=0, n=parts.length; i<n; i++) {
      parts[i] = unescape(Utils.trim(parts[i]));
    }
    return parts;
  }
};

Utils.csvSplit = Utils.delimLineParser(',');
// Utils.tsvReadLine = Utils.delimLineParser('\t')

// Gets a function to convert a line from a delimited text file into a record
//
Utils.delimRecordParser = function(fields, sep) {
  if (!Utils.isArray(fields) || fields.length == 0) {
    error("Utils#delimRecordParser() Invalid headers:", fields);
  }
  var read = Utils.delimLineParser(sep);
  var fieldCount = fields.length;
  return function(line) {
    var parts = read(line),
        partCount = parts.length;
    if (partCount != fieldCount) { // TODO: throw error?
      trace("#delimRecordParser() Warning: field count mismatch");
      trace("  [" + line + "]");
    }
    var rec = {};
    for (var i=0; i<fieldCount; i++) {
      rec[fields[i]] = parts[i] || null;
    }
    return rec;
  }
};

