/* @requires mapshaper-common */

internal.splitShellTokens = function(str) {
  var BAREWORD = '([^\'"\\s])+';
  var DOUBLE_QUOTE = '"((\\\\"|[^"])*?)"';
  var SINGLE_QUOTE = '\'((\\\\\'|[^\'])*?)\'';
  var rxp = new RegExp('(' + BAREWORD + '|' + SINGLE_QUOTE + '|' + DOUBLE_QUOTE + ')*', 'g');
  var matches = str.match(rxp) || [];
  var chunks = matches.filter(function(chunk) {
    // single backslashes may be present in multiline commands pasted from a makefile, e.g.
    return !!chunk && chunk != '\\';
  }).map(utils.trimQuotes);
  return chunks;
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

// Split comma-delimited list, trim quotes from entire list and
// individual members
internal.parseStringList = function(token) {
  var delim = ',';
  var list = internal.splitOptionList(token, delim);
  if (list.length == 1) {
    list = internal.splitOptionList(list[0], delim);
  }
  return list;
};

// Accept spaces and/or commas as delimiters
internal.parseColorList = function(token) {
  var delim = ', ';
  var token2 = token.replace(/, *(?=[^(]*\))/g, '~~~'); // kludge: protect rgba() functions from being split apart
  var list = internal.splitOptionList(token2, delim);
  if (list.length == 1) {
    list = internal.splitOptionList(list[0], delim);
  }
  list = list.map(function(str) {
    return str.replace(/~~~/g, ',');
  });
  return list;
};

internal.cleanArgv = function(argv) {
  argv = argv.map(function(s) {return s.trim();}); // trim whitespace
  argv = argv.filter(function(s) {return s !== '';}); // remove empty tokens
  // removing trimQuotes() call... now, strings like 'name="Meg"' will no longer
  // be parsed the same way as name=Meg and name="Meg"
  //// argv = argv.map(utils.trimQuotes); // remove one level of single or dbl quotes
  return argv;
};

internal.splitOptionList = function(str, delimChars) {
  var BAREWORD = '([^' + delimChars + '\'"][^' + delimChars + ']*)'; // TODO: make safer
  var DOUBLE_QUOTE = '"((\\\\"|[^"])*?)"';
  var SINGLE_QUOTE = '\'((\\\\\'|[^\'])*?)\'';
  var rxp = new RegExp('^(' + BAREWORD + '|' + SINGLE_QUOTE + '|' + DOUBLE_QUOTE + ')([' + delimChars + ']+|$)');
  var chunks = [];
  var match;
  while ((match = rxp.exec(str)) !== null) {
    chunks.push(match[1]);
    str = str.substr(match[0].length);
  }
  return chunks.filter(function(chunk) {
    return !!chunk && chunk != '\\';
  }).map(utils.trimQuotes);
};

// Prepare a value to be used as an option value.
// Places quotes around strings containing spaces.
// e.g. converts   Layer 1 -> "Layer 1"
//   for use in contexts like: name="Layer 1"
internal.formatOptionValue = function(val) {
  val = String(val);
  if (val.indexOf(' ') > -1) {
    val = JSON.stringify(val); // quote ids with spaces
  }
  return val;
};
