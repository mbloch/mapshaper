/* @requires mapshaper-common */

MapShaper.getFormattedStringify = function(numArrayKeys) {
  var keyIndex = utils.arrayToIndex(numArrayKeys);
  var quoteStr = '\u1000\u2FD5\u0310'; // TODO: avoid using a string that might be present in the content
  var stripRxp = new RegExp('"' + quoteStr + '|' + quoteStr + '"', 'g');
  var indentChars = '\t';

  function replace(key, val) {
    // pre-format coordinate arrays
    if (key in keyIndex && utils.isArray(val)) {
      var str = JSON.stringify(val);
      // skip arrays containing strings (problem with double-quote escaping)
      if (str.indexOf('"' == -1)) {
        return quoteStr + str.replace(/,/g, ', ') + quoteStr;
      }
    }
    return val;
  }

  return function(obj) {
    var json = JSON.stringify(obj, replace, indentChars);
    return json.replace(stripRxp, '');
  };
};
