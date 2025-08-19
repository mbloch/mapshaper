
export function toScaledStr(num, k) {
  var abs = Math.abs(num);
  var signed = num != abs;
  // String() matches behavior of big.js
  // (as opposed to toFixed() or toPrecision())
  var s = abs < 1e-6 ? abs.toFixed(k) : String(abs);
  var parts = s.split('.');
  var integer = parts[0] == '0' ? '' : parts[0];
  var decimal = parts.length == 2 ? parts[1] : '';
  if (decimal.length < k) {
    decimal = decimal.padEnd(k, '0');
  } else if (decimal.length > k) {
    decimal = decimal.slice(0, k);
  }
  var s2 = integer + decimal;
  // remove any leading 0s
  while (s2[0] == 0 && s2.length > 1) {
    s2 = s2.slice(1);
  }
  if (signed) {
    s2 = '-' + s2;
  }
  return s2;
}

// returns Number
export function fromScaledStr(s, decimals) {
  var signed = s[0] == '-';
  var uns = signed ? s.slice(1) : s;
  var s2, len;
  len = uns.length;
  if (len > decimals) {
    s2 = uns.slice(0, len - decimals) + '.' + uns.slice(-decimals);
  } else if (len == decimals) {
    s2 = '0.' + uns;
  } else {
    s2 = '0.' + uns.padStart(decimals, '0');
  }
  if (signed) {
    s2 = '-' + s2;
  }
  return Number(s2);
}

export function findBigIntScaleFactor() {
  var minVal = Infinity;
  var intLen = 0, s;
  for (var i=0, n=arguments.length; i<n; i++) {
    minVal = Math.min(minVal, Math.abs(arguments[i]));
  }
  if (minVal >= 1) {
    s = minVal.toFixed(1);
    intLen = s.indexOf('.');
  } else if (minVal !== 0) {
    s = minVal.toFixed(10).slice(2); // decimal part, up to _ decimals
    while (s[0] === '0') {
      intLen--;
      s = s.slice(1);
    }
  }
  return 17 - intLen;
}
