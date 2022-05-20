
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
