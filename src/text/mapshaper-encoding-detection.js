
import { decodeString } from '../text/mapshaper-encodings';

// Try to detect the encoding of some sample text.
// Returns an encoding name or null.
// @samples Array of buffers containing sample text fields
// TODO: Improve reliability and number of detectable encodings.
export function detectEncoding(samples) {
  var encoding = null;
  if (looksLikeUtf8(samples)) {
    encoding = 'utf8';
  } else if (looksLikeWin1252(samples)) {
    // Win1252 is the same as Latin1, except it replaces a block of control
    // characters with n-dash, Euro and other glyphs. Encountered in-the-wild
    // in Natural Earth (airports.dbf uses n-dash).
    encoding = 'win1252';
  }
  return encoding;
}

// Convert an array of text samples to a single string using a given encoding
export function decodeSamples(enc, samples) {
  return samples.map(function(buf) {
    return decodeString(buf, enc).trim();
  }).join('\n');
}


// Quick-and-dirty win1251 detection: decoded string contains mostly common ascii
// chars and almost no chars other than word chars + punctuation.
// This excludes encodings like Greek, Cyrillic or Thai, but
// is susceptible to false positives with encodings like codepage 1250 ("Eastern
// European").
function looksLikeWin1252(samples) {
  var ascii = 'abcdefghijklmnopqrstuvwxyz0123456789.\'"?+-\n,:;/|_$% ', //common l.c. ascii chars
      extended = 'ßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýÿ°–±’‘', // common extended
      str = decodeSamples('win1252', samples),
      asciiScore = getCharScore(str, ascii),
      totalScore = getCharScore(str, extended + ascii);
  return totalScore > 0.97 && asciiScore >= 0.6; // mostly unaccented ascii chars
}

// Reject string if it contains the "replacement character" after decoding to UTF-8
function looksLikeUtf8(samples) {
  // Remove the byte sequence for the utf-8-encoded replacement char before decoding,
  // in case the file is in utf-8, but contains some previously corrupted text.
  // samples = samples.map(internal.replaceUtf8ReplacementChar);
  var str = decodeSamples('utf8', samples);
  return str.indexOf('\ufffd') == -1;
}

// function replaceUtf8ReplacementChar(buf) {
//   var isCopy = false;
//   for (var i=0, n=buf.length; i<n; i++) {
//     // Check for UTF-8 encoded replacement char (0xEF 0xBF 0xBD)
//     if (buf[i] == 0xef && i + 2 < n && buf[i+1] == 0xbf && buf[i+2] == 0xbd) {
//       if (!isCopy) {
//         buf = utils.createBuffer(buf);
//         isCopy = true;
//       }
//       buf[i] = buf[i+1] = buf[i+2] = 63; // ascii question mark
//     }
//   }
//   return buf;
// }

// Calc percentage of chars in a string that are present in a second string
// @chars String of chars to look for in @str
function getCharScore(str, chars) {
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
}
