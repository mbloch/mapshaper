/* @requires core */

Utils.leftPad = function(str, size, pad) {
  pad = pad || ' ';
  str = String(str);
  var chars = size - str.length;
  while (chars-- > 0) {
    str = pad + str;
  }
  return str;
};

Utils.trim = function(str) {
  return str.replace(/^\s+|\s+$/g, '');
};

Utils.capitalizeWord = function(w) {
  return w ? w.charAt(0).toUpperCase() + w.substr(1) : '';
};




Utils.addThousandsSep = function(str) {
  var fmt = '',
      start = str[0] == '-' ? 1 : 0,
      dec = str.indexOf('.'),
      end = str.length,
      ins = (dec == -1 ? end : dec) - 3;
  while (ins > start) {
    fmt = ',' + str.substring(ins, end) + fmt;
    end = ins;
    ins -= 3;
  }
  return str.substring(0, end) + fmt;
};


Utils.numToStr = function(num, decimals) {
  return decimals >= 0 ? num.toFixed(decimals) : String(num);
};


Utils.formatNumber = function(num, decimals, nullStr, showPos) {
  var fmt;
  if (isNaN(num)) {
    fmt = nullStr || '-';
  } else {
    fmt = Utils.numToStr(num, decimals);
    fmt = Utils.addThousandsSep(fmt);
    if (showPos && parseFloat(fmt) > 0) {
      fmt = "+" + fmt;
    }
  }
  return fmt;
};
