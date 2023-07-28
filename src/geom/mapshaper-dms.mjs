import { stop } from '../utils/mapshaper-logging';

// Parse a formatted value in DMS DM or D to a numeric value. Returns NaN if unparsable.
// Delimiters: degrees: D|d|°; minutes: '; seconds: "
export function parseDMS(str, fmt) {
  var defaultRxp = /^(?<prefix>[nsew+-]?)(?<d>[0-9.]+)[d°]? ?(?<m>[0-9.]*)['′]? ?(?<s>[0-9.]*)["″]? ?(?<suffix>[nsew]?)$/i;
  var rxp = fmt ? getParseRxp(fmt) : defaultRxp;
  var match = rxp.exec(str.trim());
  var d = NaN;
  var deg, min, sec, inv;
  if (match) {
    deg = match.groups.d || '0';
    min = match.groups.m || '0';
    sec = match.groups.s || '0';
    d = (+deg) + (+min) / 60 + (+sec) / 3600;
    if (/[sw-]/i.test(match.groups.prefix || '') || /[sw]/i.test(match.groups.suffix || '')) {
      d = -d;
    }
  }
  return d;
}

var cache = {};

function getParseRxp(fmt) {
  if (fmt in cache) return cache[fmt];
  var rxp = fmt;
  rxp = rxp.replace('[-]', '(?<prefix>-)?'); // optional -
  rxp = rxp.replace(/\[[NSEW, +-]{2,}\]/, '(?<prefix>$&)');
  // TODO: validate that if there are degree decimals, there are no M or S codes
  rxp = rxp.replace(/D+(\.D+)?/, (m, g1) => {
    var s = '[0-9]+';
    if (g1) s += `\\.[0-9]+`;
    return `(?<d>${s})`;
  });
  // TODO: validate that if there are minutes decimals, there are no S codes
  rxp = rxp.replace(/(MM?)(\.M+)?/, (m, g1, g2) => {
    var s = g1.length == 1 ? '[0-9]+' : '[0-9][0-9]';
    if (g2) s += '\\.[0-9]+';
    return `(?<m>${s})`;
  });
  rxp = rxp.replace(/(SS?)(\.S+)?/, (m, g1, g2) => {
    var s = g1.length == 1 ? '[0-9]+' : '[0-9][0-9]';
    if (g2) s += '\\.[0-9]+';
    return `(?<s>${s})`;
  });
  rxp = '^' + rxp + '$';
  try {
    // TODO: make sure all DMS codes have been matched
    cache[fmt] = new RegExp(rxp);
  } catch(e) {
    stop('Invalid DMS format string:', fmt);
  }
  return cache[fmt];
}

function formatNumber(val, integers, decimals) {
  var str = val.toFixed(decimals);
  var parts = str.split('.');
  if (parts.length > 0) {
    parts[0] = parts[0].padStart(integers, '0');
    str = parts.join('.');
  }
  return str;
}

export function formatDMS(coord, fmt) {
  if (!fmt) fmt = '[-]D°M\'S.SSS';
  var str = fmt;
  var dstr, mstr, sstr;
  var match = /(D+)[^M]*(M+)?[^S[\]]*(S+)?/.exec(fmt);
  var gotSeconds = match && !!match[3];
  var gotMinutes = match && !!match[2];
  if (!match || gotSeconds && !gotMinutes) {
    stop('Invalid DMS format string:', fmt);
  }
  var integers = gotSeconds && match[3].length || gotMinutes && match[2].length || match[1].length;
  var decimalRxp = gotSeconds && /S\.(S+)/ || gotMinutes && /M\.(M+)/ || /D\.(D+)/;
  var decimals = decimalRxp.test(fmt) ? decimalRxp.exec(fmt)[1].length : 0;
  if (gotMinutes) {
    var RES = Math.pow(10, decimals);
    var CONV = gotSeconds ? 3600 * RES : 60 * RES;
    var r = Math.floor(Math.abs(coord) * CONV + 0.5);
    var lastPart = formatNumber((r / RES) % 60, integers, decimals);
    if (gotSeconds) {
      r = Math.floor(r / (RES * 60));
      sstr = lastPart;
      mstr = String(r % 60).padStart(match[2].length, '0');
    } else {
      r = Math.floor(r / RES);
      mstr = lastPart;
    }
    dstr = String(Math.floor(r / 60)).padStart(match[1].length, '0');
  } else {
    dstr = Math.abs(coord).toFixed(decimals);
  }
  str = str.replace(/\[-\]/, s => coord < 0 ? '-' : '');
  str = str.replace(/\[[+-]+\]/, s => coord < 0 ? '-' : '+');
  str = str.replace(/\[[NS, ]+\]/, s => coord < 0 ? 'S' : 'N');
  str = str.replace(/\[[EW, ]+\]/, s => coord < 0 ? 'W' : 'E');
  str = str.replace(/D+(\.D+)?/, dstr);
  if (gotMinutes) str = str.replace(/M+(\.M+)?/, mstr);
  if (gotSeconds) str = str.replace(/S+(\.S+)?/, sstr);
  return str;
}
