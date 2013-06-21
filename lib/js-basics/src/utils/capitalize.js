/* @requires core */


var _capitalizeMappings = {
  ucla:"UCLA",
  hs:"HS",
  umdnj:"UMDNJ",
  ny:"NY",
  jfk:"JFK",
  nyu:"NYU",
  nyc:"NYC",
  ne:"NE",
  nw:"NW",
  se:"SE",
  sw:"SW",
  of:"of",
  and:"and",
  llc:"LLC",
  'for':"for",
  at:"at"
};

var _titleCaseMappings = {


};

function _uc() {
  var str = arguments[0];
  var str1 = arguments[1];
  if ( !str1 ) {
    str = str.toUpperCase();
  }
  return str;
}

var _rxp = /(['])?\b[a-z]/g;
var _capitalizeRxp = /('?\b[\w]+)/;
/**
 * Capitalize the words in a string, applying a set of case rules for irregular words.
 *
 * @param s String to be capitalized.
 * @param mappings An object containing case rules for special words like 'and'.
 * @return Capitalized string.
 *
 */
Utils.toTitleCase = function(s, mappings) {
  s = s.toLowerCase();
  var parts = s.split( _capitalizeRxp );
  for (var i=0, len=parts.length; i<len; i++) {
    var part = parts[i];
    if ( part == '' || part == ' ' ) {
      continue;
    }
    
    if (mappings && (part in mappings)) {
      parts[i] = mappings[part];
    }
    else if (part in _capitalizeMappings) {
      parts[i] = _capitalizeMappings[part];
    }
    else {
      parts[i] = part.replace(_rxp, _uc);
    }
  }
  return parts.join('');
}