import utils from '../utils/mapshaper-utils';
import { stop } from '../utils/mapshaper-logging';
var assignmentRxp = /^([a-z0-9_+-]+)=(?!=)(.*)$/i; // exclude ==

export function splitShellTokens(str) {
  var BAREWORD = `([^'"\\s])+`;
  var DOUBLE_QUOTE = `"((\\\\"|[^"])*?)"`;
  var SINGLE_QUOTE = `'((\\\\'|[^'])*?)'`;
  var rxp = new RegExp('(' + BAREWORD + '|' + SINGLE_QUOTE + '|' + DOUBLE_QUOTE + ')*', 'g');
  var matches = str.match(rxp) || [];
  var chunks = matches.filter(function(chunk) {
    // single backslashes may be present in multiline commands pasted from a makefile, e.g.
    return !!chunk && chunk != '\\';
  }).map(utils.trimQuotes);
  return chunks;
}

export function parsePercent(o) {
  var str = String(o);
  var isPct = str.indexOf('%') > 0;
  var pct;
  if (isPct) {
    pct = Number(str.replace('%', '')) / 100;
  } else {
    pct = Number(str);
  }
  if (!(pct >= 0 && pct <= 1)) {
    stop(utils.format("Invalid percentage: %s", str));
  }
  return pct;
}

export function parseNumberList(token) {
  return token.split(',').map(parseFloat);
}

// Numbers, or percentages kept as strings ("30%") for the command to resolve
// e.g. "0,30%,100%" -> [0, "30%", "100%"]. An item that starts a named ramp's
// list (see splitRampLists()) stays a string, e.g. "sea:-6000".
export function parseNumberOrPercentList(token) {
  return token.split(',').map(function(str) {
    var named = rampItemRxp.exec(str.trim());
    var s = named ? named[2].trim() : str.trim();
    var val = /%$/.test(s) ? Number(s.slice(0, -1)) : Number(s);
    if (s === '' || s == '%' || !isFinite(val)) {
      stop(utils.format('Invalid value in list: %s', str));
    }
    if (named) return named[1] + ':' + (/%$/.test(s) ? s : val);
    return /%$/.test(s) ? s : val;
  });
}

// "name:value", the first item of a named ramp's list
var rampItemRxp = /^([a-z][a-z0-9_-]*):(.*)$/i;

// Splits the items of a list option (colors=, breaks=) into lists by ramp, for
// options that set several ramps at once, e.g.
// colors=#ccc,#999,sea:#003,#06c -> {'': ['#ccc', '#999'], sea: ['#003', '#06c']}
// An item "name:value" starts the list of the named ramp, which runs to the
// next named item; items before any name are the unnamed list (''). Names are
// in lower case, and a number after a name is a number again. Returns null
// for an empty list.
export function splitRampLists(list) {
  var lists = {}, name = '';
  if (!list || list.length === 0) return null;
  list.forEach(function(item) {
    var named = typeof item == 'string' ? rampItemRxp.exec(item.trim()) : null;
    var val = item;
    if (named) {
      name = named[1].toLowerCase();
      val = named[2].trim();
      if (lists[name]) stop(utils.format('The %s: list is given twice', name));
      if (val !== '' && !/%$/.test(val) && isFinite(val)) val = Number(val);
    }
    (lists[name] || (lists[name] = [])).push(val);
  });
  return lists;
}

export function listHasRampNames(list) {
  return Array.isArray(list) && list.some(function(item) {
    return typeof item == 'string' && rampItemRxp.test(item.trim());
  });
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
  // accept rgb(0 0 0) rgb(0,0,0) rgb(0, 0, 0)
  var token2 = token.replace(/[ ,] *(?=[^(]*\))/g, '~~~'); // kludge: protect rgba() functions from being split apart
  var list = splitOptionList(token2, delim);
  if (list.length == 1) {
    list = splitOptionList(list[0], delim);
  }
  list = list.map(function(str) {
    return str.replace(/~~~/g, ',');
  });
  return list;
}

// Splits a comma-delimited list into items, for the list-valued options of the
// -symbols command (radii=, values=, fills=). Unlike parseStringList(), empty
// items are kept, so that a blank item in one list still lines up with its
// counterpart in another. Commas nested inside parentheses, brackets, braces
// or quotes are not delimiters, so items like rgba(0,0,0,0.5), Math.max(A,B)
// and [R, R * 0.5] survive as single items.
export function splitListItems(str) {
  var items = [];
  var start = 0;
  var depth = 0;
  var quote = '';
  var c;
  for (var i=0, n=str.length; i<n; i++) {
    c = str[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '(' || c === '[' || c === '{') {
      depth++;
    } else if (c === ')' || c === ']' || c === '}') {
      depth--;
    } else if (c === ',' && depth <= 0) {
      items.push(str.slice(start, i));
      start = i + 1;
    }
  }
  items.push(str.slice(start));
  return items.map(function(item) {
    return utils.trimQuotes(item.trim());
  });
}

export function cleanArgv(argv) {
  // Note: original trim caused some quoted spaces to be removed
  // (e.g. bash shell seems to convert [delimiter=" "] to [delimiter= ],
  //  which then got trimmed to [delimiter=] below)
  //// argv = argv.map(function(s) {return s.trim();}); // trim whitespace

  // Updated: don't trim space from tokens like [delimeter= ]
  argv = argv.map(function(s) {
    if (!/= $/.test(s)) {
      s = utils.rtrim(s);
    }
    s = utils.ltrim(s);
    return s;
  });
  argv = argv.filter(function(s) {return s !== '';}); // remove empty tokens
  // Note: removing trimQuotes() call... now, strings like 'name="Meg"' will no longer
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

export function isAssignment(token) {
  return assignmentRxp.test(token);
}

export function splitAssignment(token) {
  var match = assignmentRxp.exec(token),
      name = match[1],
      val = utils.trimQuotes(match[2]);
  return [name, val];
}
