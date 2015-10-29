/* @requires mapshaper-encodings */

// Try to detect the encoding of some sample text.
// Returns an encoding name or null.
// @samples Array of buffers containing sample text fields
// TODO: Improve reliability and number of detectable encodings.
MapShaper.detectEncoding = function(samples) {
  var encoding = null;
  if (MapShaper.looksLikeUtf8(samples)) {
    encoding = 'utf8';
  } else if (MapShaper.looksLikeWin1252(samples)) {
    // Win1252 is the same as Latin1, except it replaces a block of control
    // characters with n-dash, Euro and other glyphs. Encountered in-the-wild
    // in Natural Earth (airports.dbf uses n-dash).
    encoding = 'win1252';
  }
  return encoding;
};

// Convert an array of text samples to a single string using a given encoding
MapShaper.decodeSamples = function(enc, samples) {
  return samples.map(function(buf) {
    return MapShaper.decodeString(buf, enc).trim();
  }).join('\n');
};

MapShaper.formatSamples = function(str) {
  return MapShaper.formatStringsAsGrid(str.split('\n'));
};

// Quick-and-dirty win1251 detection: decoded string contains mostly common ascii
// chars and almost no chars other than word chars + punctuation.
// This excludes encodings like Greek, Cyrillic or Thai, but
// is susceptible to false positives with encodings like codepage 1250 ("Eastern
// European").
MapShaper.looksLikeWin1252 = function(samples) {
  var ascii = 'abcdefghijklmnopqrstuvwxyz0123456789.\'"?+-\n,:;/|_$% ', //common l.c. ascii chars
      extended = 'ßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýÿ°–', // common extended
      str = MapShaper.decodeSamples('win1252', samples),
      asciiScore = MapShaper.getCharScore(str, ascii),
      totalScore = MapShaper.getCharScore(str, extended + ascii);
  return totalScore > 0.97 && asciiScore > 0.7;
};

// Accept string if it doesn't contain the "replacement character"
MapShaper.looksLikeUtf8 = function(samples) {
  var str = MapShaper.decodeSamples('utf8', samples);
  return str.indexOf('\ufffd') == -1;
};

// Calc percentage of chars in a string that are present in a second string
// @chars String of chars to look for in @str
MapShaper.getCharScore = function(str, chars) {
  var index = {},
      count = 0,
      score;
  str = str.toLowerCase();
  for (var i=0, n=chars.length; i<n; i++) {
    index[chars[i]] = 1;
  }
  for (i=0, n=str.length; i<n; i++) {
    count += index[str[i]] || 0;
  }
  return count / str.length;
};
