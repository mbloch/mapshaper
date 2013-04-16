/* @requires core, browser, textutils */

/*
A simplified version of printf formatting
Format codes: %[flags][width][.precision]type

supported flags:
  +   add '+' before positive numbers
  0   left-pad with '0'
width: 1 to many
precision: .(1 to many)
type:
  s     string
  di    integers
  f     decimal numbers
  xX    hexidecimal (unsigned)
  %     literal '%'

Examples:
  code    val    formatted
  %+d     1      '+1'
  %4i     32     '  32'
  %04i    32     '0032'
  %x      255    'ff'
  %.2f    0.125  '0.13'
  %'f     1000   '1,000'
*/

Utils.format = (function() {
  function getPadString(len, c) {
    var str = "";
    for (var i=0; i<len; i++)
      str += c;
    return str;
  }

  function formatValue(matches, val) {
    var flags = matches[1];
    var padding = matches[2];
    var decimals = matches[3] ? parseInt(matches[3].substr(1)) : void 0;
    var type = matches[4];

    if (type == '%') {
      return '%'; // %% = literal '%'
    }
    var isString = type == 's',
        isHex = type == 'x' || type == 'X',
        isInt = type == 'd' || type == 'i',
        isFloat = type == 'f',
        isNumber = !isString;

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
      if (type == 'X')
        str = str.toUpperCase();
    }
    else if (isNumber) {
      str = Utils.numToStr(val, isInt ? 0 : decimals);
      if (str[0] == '-') {
        isNeg = true;
        str = str.substr(1);
      }
      isZero = parseFloat(str) == 0;
      if (flags.indexOf("'") != -1) {
        str = Utils.addThousandsSep(str);
      }
      if (!isZero) { // BUG: sign is added when num rounds to 0
        if (isNeg) {
          sign = "\u2212"; // U+2212
        } else if (flags.indexOf('+') != -1) {
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
    } else if (padChar == '0') {
      str = sign + padStr + str;
    } else {
      str = padStr + sign + str;
    }
    return str;
  }

  var codeRxp = /%([\'+0]*)([1-9]?)((?:\.[1-9])?)([sdifxX%])/g;

  return function format(s) {
    var arr = Array.prototype.slice.call(arguments, 1);
    var ostr = "";
    for (var startIdx=0, i=0, len=arr.length, matches; i<len && (matches=codeRxp.exec(s)); i++) {
      ostr += s.substring(startIdx, codeRxp.lastIndex - matches[0].length);
      ostr += formatValue(matches, arr[i]);
      startIdx = codeRxp.lastIndex;
    }
    codeRxp.lastIndex = 0;

    if (i != len) {
      error("[Utils.format()] formatting codes did not match inputs; string:", s);
    }
    ostr += s.substr(startIdx);
    return ostr;
  };
}());
