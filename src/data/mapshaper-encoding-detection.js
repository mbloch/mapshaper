/* @requires mapshaper-encodings */

// Try to detect the encoding of some sample text.
// Returns an encoding name or null.
// @samples Array of buffers containing sample text fields
// TODO: Improve reliability and number of detectable encodings.
MapShaper.detectEncoding = function(samples) {
  var encoding = null;
  if (MapShaper.looksLikeUtf8(samples)) {
    encoding = 'utf8';
  } else if (MapShaper.looksLikeLatin1(samples)) {
    encoding = 'latin1';
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

MapShaper.looksLikeLatin1 = function(samples) {
  var likelyChars = 'abcdefghijklmnopqrstuvwxyz0123456789' +
      'ßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýÿ' + // accented letters
      '-,;/.\'" \n'; // punctuation, etc.
  var str = MapShaper.decodeSamples('latin1', samples);
  return MapShaper.testSingleByteSample(str, likelyChars);
};

MapShaper.looksLikeUtf8 = function(samples) {
  var str = MapShaper.decodeSamples('utf8', samples);
  return MapShaper.testMultiByteSample(str);
};

// Accept string if it doesn't contain the "replacement character"
// TODO: Improve; with some multibyte encodings, you are more likely
//   to get gibberish than the replacement character.
MapShaper.testMultiByteSample = function(str) {
  return str.indexOf('\ufffd') == -1;
};

// Accept string if almost all of its chars are whitelisted
// @chars A string of whitelisted characters
// TODO: Consider generating a score based on frequency data
MapShaper.testSingleByteSample = function(str, chars) {
  var index = {}, count = 0;
  str = str.toLowerCase(); //
  for (var i=0, n=chars.length; i<n; i++) {
    index[chars[i]] = 1;
  }
  for (i=0, n=str.length; i<n; i++) {
    count += index[str[i]] || 0;
  }
  return count / str.length > 0.98;
};
