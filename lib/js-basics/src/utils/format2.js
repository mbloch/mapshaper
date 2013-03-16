/* @requires core, browser, textutils */

/*
    [[fill]align][sign][#][0][minimumwidth][.precision][type]

    The brackets ([]) indicate an optional element.

    Then the optional align flag can be one of the following:

        '<' - Forces the field to be left-aligned within the available
              space (This is the default.)
        '>' - Forces the field to be right-aligned within the
              available space.
        '=' - Forces the padding to be placed after the sign (if any)
              but before the digits.  This is used for printing fields
              in the form '+000000120'. This alignment option is only
              valid for numeric types.
        '^' - Forces the field to be centered within the available
              space.

*/

var __formatRxp = /\{([0-9]?|(?:[a-zA-Z_]\w*))(?::(\+?0?)([1-9]?)(,?)((?:\.\d+)?)([sdifxX]))?\}/g;

function getPadString(len, c) {
  var str = "";
  for (var i=0; i<len; i++) {
    str += c;
  }
  return str;
}

function __format(matches, val) {
  var flags = matches[2];
  var padding = matches[3];
  var useSep = matches[4] == ',';
  var decimals = matches[5];
  var type = matches[6];


  var isString = type == 's' || !type; // no format type, treat as string
  var isHex = type == 'x' || type == 'X';
  var isInt = type == 'd' || type == 'i';
  var isFloat = type == 'f';
  var isNumber = !isString;
  var sign = "", 
    padDigits = 0,
    isZero = false,
    isNeg = false;

  var str;
  if (isString) {
    str = String(val);
  }
  else if (isHex) {
    str = val.toString(16);
    if (type == 'X') {
      str = str.toUpperCase();
    }
  }
  else if (isInt) {
    var rounded = Math.round(val);
    isZero = rounded == 0;
    isNeg = rounded < 0;
    str = String(Math.abs(rounded));
  }
  else if (isFloat) {
    if (decimals) {
      var absVal = Math.abs(val) + 1e-10;
      var decimalDigits = parseInt(decimals.substr(1), 10);
      str = absVal.toFixed(decimalDigits);
      isZero = parseFloat(str) === 0;
      isNeg = !isZero && val < 0;
    }
    else {
      str = String(Math.abs(val));
      isZero = val === 0;
      isNeg = val < 0;
    }
  }

  if (isNumber && !isHex) {
    // add thousands separator
    if (useSep) {
      var decimalIdx = str.indexOf('.');
      var intDigits = decimalIdx == -1 ? str.length : decimalIdx;
      var fmt = "",
        start = 0,
        end = intDigits % 3 || 3;
      while(end < intDigits) {
        fmt += str.substring(start, end) + ',';
        start = end;
        end += 3;
      }
      str = fmt + str.substr(start);
    }

    // calc sign
    if (!isZero) { // BUG: sign is added when num rounds to 0
      if (isNeg) {
        sign = "\u2212"; // U+2212 
      }
      else if (flags.indexOf('+') != -1/* && roundedVal > 0*/) {
        sign = '+';
      }
    }
  }

  if (padding) {
    var strLen = str.length + sign.length;
    var minWidth = parseInt(padding, 10);
    if (strLen < minWidth) {
      padDigits = minWidth - strLen;
      var padChar = flags.indexOf('0') == -1 ? ' ' : '0';
      var padStr = getPadString(padDigits, padChar);
    }
  }

  if (padDigits == 0) {
    str = sign + str;
  }
  else if (padChar == '0') {
    str = sign + padStr + str;
  } 
  else {
    str = padStr + sign + str;
  }
  return str;
}

Utils.format = function(s) {
  if (arguments.length == 2 && Utils.isObject(arguments[1])) {
    var args = arguments[1];
  }
  else {
    args = Array.prototype.slice.call(arguments, 1);
  }

  var matches,
    ostr = "",
    startIdx = 0,
    i = 0;
  while(matches=__formatRxp.exec(s)) {
    ostr += s.substring(startIdx, __formatRxp.lastIndex - matches[0].length);
    var id = matches[1] || i; // identifier may be empty
    if (!(id in args)) {
      trace("[Utils.format()] Missing argument:", id, "from format:", matches[0]);
      return "";
    }
    ostr += __format(matches, args[id]);
    startIdx = __formatRxp.lastIndex;
    i++
  }
  __formatRxp.lastIndex = 0;

  ostr += s.substr(startIdx);
  return ostr;
};