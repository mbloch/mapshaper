
import { decodeString } from '../text/mapshaper-encodings';
import utils from '../utils/mapshaper-utils';

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
  // score each encoding as 2 (high confidence) 1 (low confidence) or 0 (fail)
  var candidates = [{
    // latin1 is the original Shapefile encoding, using as an imperfect fallback
    // (sorts to the top only if all other encodings score 0)
    encoding: 'latin1',
    confidence: 0
  },{
    encoding: 'win1252',
    confidence: looksLikeWin1252(samples)
  }, {
    encoding: 'utf8',
    confidence: looksLikeUtf8(samples)
  }, {
    encoding: 'gb18030',
    confidence: looksLikeGB18030(samples)
  }];
  utils.sortOn(candidates, 'confidence', 'descending');
  return candidates[0];
}

export function decodeSamples(enc, samples) {
  return samples.map(function(buf) {
    return decodeString(buf, enc).trim();
  });
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
  var commonAscii = 'abcdefghijklmnopqrstuvwxyz0123456789.()\'"?+-\n,:;/|_$% ',
      // more common extended chars + NBS (found in the wild)
      moreChars = 'ßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýÿ°–±’‘' + '\xA0',
      str = decodeSamples('win1252', samples).join(''),
      commonAsciiPct = calcCharPct(str, commonAscii),
      expandedPct = calcCharPct(str, moreChars) + commonAsciiPct;
  return expandedPct > 0.98 && commonAsciiPct >= 0.8 && 2 ||
    expandedPct > 0.97 && commonAsciiPct >= 0.6 && 1 || 0;
}

// Reject string if it contains the "replacement character" after decoding to UTF-8
function looksLikeUtf8(samples) {
  // Remove the byte sequence for the utf-8-encoded replacement char before decoding,
  // in case the file is in utf-8, but contains some previously corrupted text.
  // samples = samples.map(internal.replaceUtf8ReplacementChar);
  var str = decodeSamples('utf8', samples).join('');
  var invalidPct = getInvalidPct(str);
  return invalidPct == 0 && 2 || invalidPct < 0.03 && 1 || 0;
}

function getInvalidPct(str) {
  // count occurences of the "replacement" character
  var invalidCount = (str.match(/\ufffd/g) || []).length;
  return invalidCount / str.length;
}

function extractCommonAsciiChars(str) {
  return str.replace(/[^a-zA-Z0-9.()'"?+\n,:;/|_$% -]/g, '');
}

// from Jun Da's frequency table
var commonHanZi = '的一了是不我他在人有这来个说上你们到地大着子那就也时道中出得为里下她要么去可以过和看之然后会自没小好生天而起对能还事想都心只家面样把国多又于头年手发如什开前当所无知老但见长已军从方声儿回意作话两点现很成身情十用些走经同进动己三行种向日明女正问此学太打间分因给本眼定二气力被门真法外听实其高先几笑再主将山战才口文最部第它西与全白者便相住公使东等边信像斯机光次感神却死理名重四做别叫王并水月果何位怎马常觉海张少处亲安特美呢色原直望命由候吧让应尔难关许车平师民夫书新接吗路利世比放活快总立队更花爱清五内金带工风克任至指往入空德吃表连解教思飞物电受今完林干代告兵加认通找远非性脸体轻记目令变似反南场跟必石拉士报李火且满该孩字红象即结言员房件万条提写或坐北早失离步陈乎请转近切黑深城办倒各父传音站官半男击合阿英决怕杀未形及算青黄落刚百论谁突交团度义罗始强紧敌八母钱极片化流管惊每题晚虽政兴答司妈夜越啊奇达谈武友数领朝保服曾拿则哪格尽根急语容喜求衣留双影刻制随冷九苦量备布照周故准客船江系姐争功怪星断句龙竟视界讲取古六静底精七河';

function looksLikeGB18030(samples) {
  var str = decodeSamples('gb18030', samples).join('');
  // Almost all the common Unicode Hanzi are in this range (along with many more uncommon ones)
  var chineseStr = str.replace(/[^\u4e00-\u9fa5]/g, '');
  var chinesePct = chineseStr.length / str.length;
  var commonAsciiStr = extractCommonAsciiChars(str);
  var commonAsciiPct = commonAsciiStr.length / str.length;
  // Some encodings get converted almost completely into valid (but mostly
  // uncommon) Chinese characters by the gb18030 converter.
  // To guard against this, we're requiring that a certain percentage of
  // characters be on a list of the most common characters.
  var commonHanZiPct = calcCharPct(chineseStr, commonHanZi);
  // check for non-convertible characters
  var invalidPct = getInvalidPct(str);
  return chinesePct > 0.5 && (chinesePct + commonAsciiPct) > 0.9 &&
    invalidPct === 0 && commonHanZiPct > 0.1 && 2 ||
    chinesePct > 0.3 && (chinesePct + commonAsciiPct) > 0.8 && commonHanZiPct > 0.05 || 0;
}

// Calc percentage of chars in a string that are present in a second string
// @chars String of chars to look for in @str
function calcCharPct(str, chars) {
  var index = {},
      count = 0;
  str = str.toLowerCase();
  for (var i=0, n=chars.length; i<n; i++) {
    index[chars[i]] = 1;
  }
  for (i=0, n=str.length; i<n; i++) {
    count += index[str[i]] || 0;
  }
  return count / str.length || 0;
}
