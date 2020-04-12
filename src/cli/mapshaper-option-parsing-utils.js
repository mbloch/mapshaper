import utils from '../utils/mapshaper-utils';

export function splitShellTokens(str) {
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
}


// Split comma-delimited list, trim quotes from entire list and
// individual members
export function parseStringList(token) {
  var delim = ',';
  var list = splitOptionList(token, delim);
  if (list.length == 1) {
    list = splitOptionList(list[0], delim);
  }
  return list;
}

// Accept spaces and/or commas as delimiters
export function parseColorList(token) {
  var delim = ', ';
  var token2 = token.replace(/, *(?=[^(]*\))/g, '~~~'); // kludge: protect rgba() functions from being split apart
  var list = splitOptionList(token2, delim);
  if (list.length == 1) {
    list = splitOptionList(list[0], delim);
  }
  list = list.map(function(str) {
    return str.replace(/~~~/g, ',');
  });
  return list;
}

export function cleanArgv(argv) {
  argv = argv.map(function(s) {return s.trim();}); // trim whitespace
  argv = argv.filter(function(s) {return s !== '';}); // remove empty tokens
  // removing trimQuotes() call... now, strings like 'name="Meg"' will no longer
  // be parsed the same way as name=Meg and name="Meg"
  //// argv = argv.map(utils.trimQuotes); // remove one level of single or dbl quotes
  return argv;
}

function splitOptionList(str, delimChars) {
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
}

// Prepare a value to be used as an option value.
// Places quotes around strings containing spaces.
// e.g. converts   Layer 1 -> "Layer 1"
//   for use in contexts like: name="Layer 1"
export function formatOptionValue(val) {
  val = String(val);
  if (val.indexOf(' ') > -1) {
    val = JSON.stringify(val); // quote ids with spaces
  }
  return val;
}
