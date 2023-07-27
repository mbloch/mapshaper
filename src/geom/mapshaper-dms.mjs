import { stop } from '../utils/mapshaper-logging';

// Parse a formatted value in DMS DM or D to a numeric value. Returns NaN if unparsable.
// Delimiters: degrees: D|d|°; minutes: '; seconds: "
export function parseDMS(str) {
  var rxp = /^([nsew+-]?)([0-9.]+)[d°]? ?([0-9.]*)['′]? ?([0-9.]*)["″]? ?([nsew]?)$/i;
  var match = rxp.exec(str.trim());
  var d = NaN;
  var deg, min, sec, inv;
  if (match) {
    deg = match[2] || '0';
    min = match[3] || '0';
    sec = match[4] || '0';
    d = (+deg) + (+min) / 60 + (+sec) / 3600;
    if (/[sw-]/i.test(match[1]) || /[sw]/i.test(match[5])) {
      d = -d;
    }
  }
  return d;
}


export function formatDMS(coord, fmt) {
  if (!fmt) fmt = '[-]D°M\'S.SSS';
  var str = fmt;
  var dms = /(D+)[^M]*(M+)[^S]*(S+)/.exec(fmt);
  if (!dms) {
    stop('Invalid DMS format string:', fmt);
  }
  var decimalsMatch = /S\.(S+)/.exec(fmt);
  var decimals = decimalsMatch ? decimalsMatch[1].length : 0;
  var RES = Math.pow(10, decimals);
  var CONV = 3600 * RES;
  var r = Math.floor(Math.abs(coord) * CONV + 0.5);
  var sstr = ((r / RES) % 60).toFixed(decimals);
  var sparts = sstr.split('.');
  if (sparts.length > 0) {
    sparts[0] = sparts[0].padStart(dms[3].length, '0');
    sstr = sparts.join('.');
  }
  r = Math.floor(r / (RES * 60));
  var dstr = String(Math.floor(r / 60)).padStart(dms[1].length, '0');
  var mstr = String(r % 60).padStart(dms[2].length, '0');
  // console.log(deg, dstr, min, mstr, sec, sstr, dms[1].length, dms[2].length, dms[3].length)

  str = str.replace(/\[-\]/, s => coord < 0 ? '-' : '');
  str = str.replace(/\[[+-]+\]/, s => coord < 0 ? '-' : '+');
  str = str.replace(/\[[NS, ]+\]/, s => coord < 0 ? 'S' : 'N');
  str = str.replace(/\[[EW, ]+\]/, s => coord < 0 ? 'W' : 'E');
  str = str.replace(/D+/, dstr);
  str = str.replace(/M+/, mstr);
  str = str.replace(/S+(\.S+)?/, sstr);
  return str;
}
