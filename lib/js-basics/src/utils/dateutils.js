/** @requires textutils, core */

/**
 * Date formatting and parsing using Unix "date" style format strings.
 * @param {string} fmt Format string.
 * @constructor
 * *
 * Supported codes:
    %Y    4-digit year (2010)
    %y    2-digit year (10 <- 2010)
    %A    day of the week (Monday)
    %a    day, abbreviated (Mon.)
    %B    name of month (January)
    %b    month, abbreviated (Jan.)
    %d    day of the month, as a digit [1,31]
    %m    Month as a decimal number [1,12]
    %I    Hour (12-hour clock) as a decimal number [1,12].
    %H    Hour (24-hour clock) as a decimal number [1,24].
    %M    Minute as a decimal number [00,59]
	  %P    Outputs: A.M. P.M.; also parses: AM PM
	  %p    Outputs: a.m. p.m.; also parses: am pm
    %S    Two-digit seconds number
 */
function DateString(fmt) {
  // Settable params
  this.padDate = false;     // Use zero-padding for one-digit months and days.
  this.tinyFormat = false;  // Use three-letter abbrevs, e.g. Jan, Tue
  
  // First, get array of literal strings alternating with formatting codes.
  // Using cross-browser equivalent of String.split(), which IE fumbles.
  // See: http://xregexp.com/cross_browser/
  //
  var match, firstIdx = 0, lastIdx, parts = [], literal;
  var rxp = '';
  while (match = this.fmtRxp.exec(fmt)) {
    var matchLen = match[0].length;
    var code = match[1];
    lastIdx = this.fmtRxp.lastIndex;
    literal = fmt.substring(firstIdx, lastIdx - matchLen);
    parts.push(literal);
    parts.push(code);
    rxp += this.escape(literal) + '(' + this[code] + ')';
    firstIdx = lastIdx;

    if (literal == '-') {
      this.padDate = true; // Guess we have date like "2010-01-01" -- format w/ padding
    }
  }
  literal = fmt.substr(firstIdx); // last literal still needs to be read.
  parts.push(literal);
  rxp += this.escape(literal);

  // match entire string:
  rxp = "^" + rxp + "$";

  this.formatRxp = new RegExp(rxp);
  this.format = fmt;
  this.formatParts = parts;
}

DateString.split = function(str, rxp) {
  
};

/**
 * Format a date using a single function call.
 * TODO: Could cache DateString objects if called repeatedly.
 *
 * @param {Date} date Date to format.
 * @param {string} fmt Date format.
 * @return {string} Formatted date.
 */
Utils.formatDate = DateString.formatDate = function(date, fmt) {
  var ds = new DateString(fmt);
  return ds.formatDate(date, fmt);
};

Utils.reformatDate = DateString.reformatDate = function(dateStr, fmt1, fmt2) {
  var d = DateString.parseDate(dateStr, fmt1);
  return DateString.formatDate(d, fmt2);
};


/**
 * Parse a date using a single function call.
 *
 * @param {string} dateStr String to parse.
 * @param {string} fmt Date format.
 * @return {Date} parsed date.
 */
Utils.parseDate = DateString.parseDate = function(dateStr, fmt) {
  var ds = new DateString(fmt);
  return ds.parseDate(dateStr, fmt);
};


/**
 * Initialize DateString prototype with some constants.
 */
DateString.prototype = (function() {
  var p = {};
  var moStr = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
  p.moArr = moStr.split('|');
  p.fmtRxp = /%(a|A|b|B|d|m|y|Y|H|I|M|S|p)/g;
  p.initTime = Date.UTC(2000, 0, 1);

  // Regex snippets for matching components of a date string.
  p['a'] = '(?:mo|tu|we|th|fr|sa|su)[\w]*\\.?';
  p['A'] = p['a'];  // Using same rxp for Full name and abbrev.
  p['b'] = '(?:' + p.moStr + ')[\w]*\\.?';
  p['B'] = p['b'];
  p['p'] = '[ap]\\.?m\\.';  // AM/PM and variants
  p['d'] = p['m'] = p['I'] = p['H'] = '[0-9]{1,2}';
  p['M'] = p['S'] = p['y'] = '[0-9]{2}';
  p['Y'] = '[0-9]{4}';

  p.months = 'January|February|March|April|May|June|July|August|September|October|November|December'.split('|');
  p.monthAbbrevs =
  'Jan.|Feb.|March|April|May|June|July|Aug.|Sept.|Oct.|Nov.|Dec.'.split('|');
  p.tinyMonthAbbrevs = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'.split('|');
  p.days =
    'Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday'.split('|');
  p.dayAbbrevs = 'Sun.|Mon.|Tues.|Wed.|Thurs.|Fri.|Sat.|Sun.'.split('|');
  p.tinyDayAbbrevs = 'Sun|Mon|Tue|Wed|Thu|Fri|Sat|Sun'.split('|');
  p.AM = 'A.M.';
  p.PM = 'P.M.';
  return p;
})();


/**
 * Format a Date object.
 * @param {Date} d Date object.
 * @return {string} Formatted date.
 */
DateString.prototype.formatDate = function(d) {
  var parts = this.formatParts.concat();
  for (var i = 0; i < parts.length; i++) {
    if (i % 2 == 1) {
      var code = parts[i];
      var str = this.formatDatePart(d, code);
      parts[i] = str;
    }
  }
  return parts.join('');
};


/**
 * Parse a string into a Date object. TODO: Handle unparsable dates better.
 *
 * @param {string} s String to parse.
 * @return {Date} Parsed date, or default date if unparsable.
 */
DateString.prototype.parseDate = function(s) {
  // var parts = s.split(this.formatRxp); // fails in ie8-
  var parts = this.formatRxp.exec(s);

  var d = new Date(this.initTime); // init to constant

  if (!parts) {
    trace('[DateString.parseDate()] unable to parse:', s, "fmt:", this.format);
    return null;
  }

  for (var i = 1, end = parts.length; i < end; i++) {
    var part = parts[i];
    var code = this.formatParts[i * 2 - 1];
    this.parseDatePart(d, code, part);
  }
  return d;
};

/**
 * Assign the value of one portion of a date string to a Date object.
 *
 * @param {Date} d Date object to modify.
 * @param {string} code Letter part of a formatting code, e.g. "a" from "%a".
 * @param {string} part Part of a date string assumed to match the code.
 */
DateString.prototype.parseDatePart = function(d, code, part) {
  var intval, strval, idx;
  switch (code) {
    case 'Y':
      d.setUTCFullYear(parseInt(part, 10));
      break;
    case 'd':
      d.setUTCDate(parseInt(part, 10));
      break;
    case 'm':
      d.setUTCMonth(parseInt(part, 10) - 1);
      break;
    case 'I':
    case 'H':
      d.setUTCHours(parseInt(part, 10));
      break;
    case 'M':
      d.setUTCMinutes(parseInt(part, 10));
      break;
    case 'S':
      d.setUTCSeconds(parseInt(part, 10));
      break;
    case 'p':
    case 'P':
      tmp = d.getUTCHours();
      var pm = /[pP]/.test(part);
      if (!pm && tmp == 12) {
        d.setUTCHours(0);
      }
      else if (pm && tmp != 12) {
        d.setUTCHours(tmp + 12);
      }
      break;
    case 'b':
    case 'B':
      part = part.toLowerCase();
      strval = part.substr(0, 3);
      idx = Utils.indexOf(monthArr, strval);
     if (idx != -1) {
        d.setUTCMonth(idx);
      }
      break;
    case 'y':
      intval = parseInt(part, 10);
      if (intval > 20) {
        intval += 1900;
      }
      else {
        intval += 2000;
      }
      d.setFullYear(intval);
      break;
    case 'A':
    case 'a': // Ignore day-of-week (generally redundant information).
      break;
  }
};


/**
 * Convert part of a Date corresponding to a format code to a string.
 * @param {Date} d Date object.
 * @param {string} code Letter portion of a formatting code.
 * @return {string} String representation of date part.
 */
DateString.prototype.formatDatePart = function(d, code) {
  var tmp, str = '';
  var minLen = 0; // Set to 2 to left-pad hours, etc. with "0".
  switch (code) {
    case 'y':
      str = String(d.getUTCDate());
      break;
    case 'Y':
      str = String(d.getUTCFullYear());
      break;
    case 'A':
      tmp = d.getUTCDay();
      str = this.days[d.getUTCDay()];
      break;
    case 'a':
      str = (this.tinyFormat ? this.tinyDayAbbrevs : this.dayAbbrevs)[d.getUTCDay()];
      break;
    case 'B':
      str = this.months[d.getUTCMonth()];
      break;
    case 'b':
      str = (this.tinyFormat ? this.tinyMonthAbbrevs : this.monthAbbrevs)[d.getUTCMonth()];
      break;
    case 'd':
      str = String(d.getUTCDate());
      minLen = this.padDate ? 2 : 0;
      break;
    case 'm':
      str = String(d.getUTCMonth() + 1);
      minLen = this.padDate ? 2 : 0;
      break;
    case 'I':
      tmp = d.getUTCHours();
      tmp = tmp % 12;
      if (tmp == 0) tmp = 12;
      str = String(tmp);
      minLen = 1;
      break;
    case 'H':
      str = String(d.getUTCHours());
      minLen = 2;
      break;
    case 'M':
      str = String(d.getUTCMinutes());
      minLen = 2;
      break;
    case 'S':
      str = String(d.getUTCSeconds());
      minLen = 2;
      break;
    case 'p':
    case 'P':
      tmp = d.getUTCHours();
      str = (tmp < 12 || tmp == 24) ? this.AM : this.PM;
      if (code == 'p') {
        str = str.toLowerCase();
      }
      break;
  }

  // 0-pad numbers, if needed.
  if (minLen > str.length) {
    str = Utils.leftPad(str, minLen, '0');
  }
  return str;
};

/**
 * Escape a literal string to use in a regexp.
 * Ref.: http://simonwillison.net/2006/Jan/20/escape/
 */
DateString.prototype.escape = function(str) {
  return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
};


function DateMath(obj) {
  if (!(this instanceof DateMath)) {
    return new DateMath(obj);
  }
  this.ms = (obj instanceof Date) ? obj.getTime() : obj;
}

DateMath.MS_PER_HOUR = 1000 * 60 * 60;
DateMath.MS_PER_DAY = DateMath.MS_PER_HOUR * 24;
//DateMath.MS_PER_WEEK = DateMath.MS_PER_DATE * 7;

DateMath.prototype.addDays = function(days) {
  this.ms += Math.round(days * DateMath.MS_PER_DAY);
  return this;
};

DateMath.prototype.addHours = function(hours) {
  this.ms += Math.round(hours * DateMath.MS_PER_HOUR);
  return this;  
}

DateMath.prototype.getTime = function() {
  return this.ms;
};

DateMath.prototype.getDate = function() {
  return new Date(this.ms);
};

Utils.addHours = function(date, hours) {
  return new DateMath(date).addHours(hours).getDate();
};

Utils.addDays = function(date, days) {
  return new DateMath(date).addDays(days).getDate();
};
