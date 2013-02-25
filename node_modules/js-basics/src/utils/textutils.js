/* @requires core */

/**
 * Left-pad a string.
 * @param {string} str Input string.
 * @param {number} size Minimum number of characters in output string.
 * @param {string} pad Character to use as padding.
 * @return {string} Padded string.
 */
Utils.leftPad = function(str, size, pad) {
  str = String(str);
  var chars = size - str.length;
  while (chars-- > 0) {
    str = pad + str;
  }
  return str;
};


/**
 * Trim whitespace from around a string.
 * @param {string} str Raw string.
 * @return {string} Trimmed string.
 */
Utils.trim = function(str) {
  return str.replace(/^\s+|\s+$/g, '');
};

Utils.capitalizeWord = function(w) {
  return w ? w.charAt(0).toUpperCase() + w.substr(1) : '';
};


/**
 * Formats an integer or decimal number.
 * @param {number} n Number to format.
 * @param {number=} decimals Number of decimals for rounding.
 * @param {string=} nullStr String to display for invalid numbers.
 * @param {boolean=} showPos If true, prefix positive numbers with '+'.
 * @return {string} Formatted number.
 */
Utils.formatNumber = function(n, decimals, nullStr, showPos) {
  decimals = decimals || 0;
  nullStr = nullStr || '';
  showPos = showPos || false;

  // Handle NaN and infinity.
  if (n == !n || n == Infinity || n == -Infinity) {
    return nullStr;
  }

  // get integer and decimal parts of the number
  var iPartStr = '';
  var dPartStr = '';
  var rawDigits = 0;

  if (decimals > 0) {
    // power of 10 for shifting decimals into integer range, for rounding.
    var pow10 = Math.pow(10, decimals);

    // Adding small number to avoid rounding errors, e.g., 1.005 -> 1.00
    var sugar = 0.0000001;
    rawDigits = Math.round(Math.abs(n) * pow10 + sugar);
    iPartStr = String(Math.floor(rawDigits / pow10));
    dPartStr = String(rawDigits % pow10);
    // left-pad the decimal string, if needed
    while (dPartStr.length < decimals) {
      dPartStr = '0' + dPartStr;
    }
    dPartStr = '.' + dPartStr;
  }
  else {
    rawDigits = Math.round(Math.abs(n));
    iPartStr = String(rawDigits);
  }

  // Format zero without decimals.
  if (iPartStr == '0' && !dPartStr) {
    return '0';
  }

  var posStr = showPos ? '+' : '';
  var negStr = '-'; //  EN_DASH;
  var signStr = (n < 0) ? negStr : posStr;

  // Add thousands delimiter (,) if needed
  if (iPartStr.length > 3) {
    var count = iPartStr.length;  // number of unprocessed digits
    var delimitedStr = '';
    while (count > 3) {
      delimitedStr = ',' + iPartStr.substr(count - 3 , 3) + delimitedStr;
      count -= 3;
    }
    iPartStr = iPartStr.substr(0, count) + delimitedStr;
  }

  return signStr + iPartStr + dPartStr;
};

