
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
      parts[i] = unescape(parts[i]);
    }
    return parts;
  }
};

// Utils.csvReadLine = Utils.delimLineParser(',');
// Utils.tsvReadLine = Utils.delimLineParser('\t')

