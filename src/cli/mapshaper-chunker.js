/* @requires mapshaper-common */

MapShaper.splitShellTokens = function(str) {
  var BAREWORD = '([^\\s\'"])+';
  var SINGLE_QUOTE = '"((\\\\"|[^"])*?)"';
  var DOUBLE_QUOTE = '\'((\\\\\'|[^\'])*?)\'';
  var rxp = new RegExp('(' + BAREWORD + '|' + SINGLE_QUOTE + '|' + DOUBLE_QUOTE + ')*', 'g');
  var matches = str.match(rxp) || [];
  var chunks = matches.map(utils.trimQuotes);
  return chunks.filter(Boolean); // remove empty strings
};

utils.trimQuotes = function(raw) {
  var len = raw.length, first, last;
  if (len >= 2) {
    first = raw.charAt(0);
    last = raw.charAt(len-1);
    if (first == '"' && last == '"' || first == "'" && last == "'") {
      return raw.substr(1, len-2);
    }
  }
  return raw;
};
