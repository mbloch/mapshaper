
import { decodeString } from '../text/mapshaper-encodings';

export function detectEncodingFromBOM(bytes) {
  // utf8 EF BB BF
  // utf16be FE FF
  // utf16le FF FE
  var n = bytes.length;
  if (n >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF) return 'utf16be';
  if (n >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE) return 'utf16le';
  if (n >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF) return 'utf8';
  return '';
}

// Try to detect the encoding of some sample text.
// Returns an encoding name or null.
// @samples Array of buffers containing sample text fields
// TODO: Improve reliability and number of detectable encodings.
export function detectEncoding(samples) {
  var encoding = null;
  var utf8 = looksLikeUtf8(samples);
  var win1252 = looksLikeWin1252(samples);
  if (utf8 == 2 || utf8 > win1252) {
    encoding = 'utf8';
  } else if (win1252 > 0) {
    encoding = 'win1252';
  } else {
    encoding = 'latin1'; // the original Shapefile encoding, using as an (imperfect) fallback
  }

  return {
    encoding: encoding,
    confidence: Math.max(utf8, win1252)
  };
}

// Convert an array of text samples to a single string using a given encoding
export function decodeSamples(enc, samples) {
  return samples.map(function(buf) {
    return decodeString(buf, enc).trim();
  }).join('\n');
}

// Win1252 is the same as Latin1, except it replaces a block of control
// characters with n-dash, Euro and other glyphs. Encountered in-the-wild
// in Natural Earth (airports.dbf uses n-dash).
//
// Quick-and-dirty win1251 detection: decoded string contains mostly common ascii
// chars and almost no chars other than word chars + punctuation.
// This excludes encodings like Greek, Cyrillic or Thai, but
// is susceptible to false positives with encodings like codepage 1250 ("Eastern
// European").
//
function looksLikeWin1252(samples) {
      //common l.c. ascii chars
  var ascii = 'abcdefghijklmnopqrstuvwxyz0123456789.()\'"?+-\n,:;/|_$% ',
      // common extended + NBS (found in the wild)
      extended = 'ßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýÿ°–±’‘' + '\xA0',
      str = decodeSamples('win1252', samples),
      asciiScore = getCharScore(str, ascii),
      totalScore = getCharScore(str, extended + ascii);
  return totalScore > 0.98 && asciiScore >= 0.8 && 2 ||
    totalScore > 0.97 && asciiScore >= 0.6 && 1 || 0;
}

// Reject string if it contains the "replacement character" after decoding to UTF-8
function looksLikeUtf8(samples) {
  // Remove the byte sequence for the utf-8-encoded replacement char before decoding,
  // in case the file is in utf-8, but contains some previously corrupted text.
  // samples = samples.map(internal.replaceUtf8ReplacementChar);
  var str = decodeSamples('utf8', samples);
  var count = (str.match(/\ufffd/g) || []).length;
  var score = 1 - count / str.length;
  return score == 1 && 2 || score > 0.97 && 1 || 0;
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
      count = 0;
  str = str.toLowerCase();
  for (var i=0, n=chars.length; i<n; i++) {
    index[chars[i]] = 1;
  }
  for (i=0, n=str.length; i<n; i++) {
    count += index[str[i]] || 0;
  }
  return count / str.length;
}
