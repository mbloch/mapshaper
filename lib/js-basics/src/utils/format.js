/* @requires core, browser, textutils */

/*
full printf:
%[parameter][flags][width][.precision][length]type

this version:
%[flags][width][.precision]type

flags:
  +
  0
widths: <1-many>
precision: .<1-many>
types: 
  sdif
  xX unsigned int as hex
  % (literal %-- need this?)

%+d  always show sign
%4i  min 4-chars padded with spaces
%04i min 4-chars padded with 0

%([+0]*)([1-9][0-9]?)?(?:\.([1-9]))?([sdifxX])
%([+0]*)([1-9])?([di])
%(0?)([1-9]?)([xX])
%
*/

var __formatRxp = /%([\'+0]*)([1-9]?)((?:\.[1-9])?)([sdifxX%])/g;

function getPadString(len, c) {
  var str = "";
  for (var i=0; i<len; i++) {
    str += c;
  }
  return str;
}

function __format(matches, val) {
  var flags = matches[1];
  var padding = matches[2];
  var decimals = matches[3];
  var type = matches[4];

  if (type == '%') {
    return '%'; // %% = literal '%'
  }
  var isString = type == 's';
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
    if (flags.indexOf("'") != -1) {
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
  var arr = Array.prototype.slice.call(arguments, 1);
  var ostr = "";
  for (var startIdx=0, i=0, len=arr.length, matches; i<len && (matches=__formatRxp.exec(s)); i++) {
    ostr += s.substring(startIdx, __formatRxp.lastIndex - matches[0].length);
    ostr += __format(matches, arr[i]);
    startIdx = __formatRxp.lastIndex;
  }
  __formatRxp.lastIndex = 0;

  if (i != len) {
    trace("[Utils.format()] Number of formatting codes did not match number of value arguments; string:", s);
  }
  ostr += s.substr(startIdx);
  return ostr;
};