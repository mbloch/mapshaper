
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
  var high = expandedPct > 0.98 && commonAsciiPct >= 0.8;
  var low = expandedPct > 0.97 && commonAsciiPct >= 0.6;
  return getScore(high, low);
}

function looksLikeUtf8(samples) {
  // Reject string if it contains the "replacement character" after decoding
  // as utf-8
  var str = decodeSamples('utf8', samples).join('');
  var invalidPct = getInvalidPct(str);
  var high = invalidPct == 0;
  var low = invalidPct < 0.03;
  return getScore(high, low);
}

function looksLikeGB18030(samples) {
  // from Jun Da's frequency table
  var commonHanZi = '的一了是不我他在人有这来个说上你们到地大着子那就也时道中出得为里下她要么去可以过和看之然后会自没小好生天而起对能还事想都心只家面样把国多又于头年手发如什开前当所无知老但见长已军从方声儿回意作话两点现很成身情十用些走经同进动己三行种向日明女正问此学太打间分因给本眼定二气力被门真法外听实其高先几笑再主将山战才口文最部第它西与全白者便相住公使东等边信像斯机光次感神却死理名重四做别叫王并水月果何位怎马常觉海张少处亲安特美呢色原直望命由候吧让应尔难关许车平师民夫书新接吗路利世比放活快总立队更花爱清五内金带工风克任至指往入空德吃表连解教思飞物电受今完林干代告兵加认通找远非性脸体轻记目令变似反南场跟必石拉士报李火且满该孩字红象即结言员房件万条提写或坐北早失离步陈乎请转近切黑深城办倒各父传音站官半男击合阿英决怕杀未形及算青黄落刚百论谁突交团度义罗始强紧敌八母钱极片化流管惊每题晚虽政兴答司妈夜越啊奇达谈武友数领朝保服曾拿则哪格尽根急语容喜求衣留双影刻制随冷九苦量备布照周故准客船江系姐争功怪星断句龙竟视界讲取古六静底精七河久绝阳识哈台确息期整伤忙娘终剑送计愿欢微您沉装敢云脚消若复收千木乐毛华集树弟皇响希诉号巴穿线汉攻呀警派刘酒雷停史阵错建足显丽另包势破亮首志观病热跑业治田冲运约暗待共院仍区害元哥围屋胡产室调类细议爷注易务众帝市摇乱密姑斗除式示睛楼造朋社持慢般皮京况块忽脑校甚查土怀福单联赶背统喝疑支血饭灵够章群威举兰游器察嘴痛铁掉宝历改推枪念参术帮党据品须居称旁退梦科岁低严引吉睡爸呼追局露维苏证村挥独节谢香亚波角案读图左掌假跳究楚余鬼钟座礼展玉肯既止守广考恩异料段尼画续米草胜存唐医程弹烟商顾招宗堂野初府激雨尚渐诗顿伯孙际沙雪板闻导致护春态基设耳简婚幸味右买演权卡继依恶庄炮亦虎州刀球需兄闪笔否烈玩啦逃排仅弄具散默景顶郑洋丝卫速侠差贵君习妇助恐救湖莫窗险顺封佛委旧印伙妹副宫洞永罪松责组防艺营班试鲁宋靠索灯介翻喊纪秘妻纸银略充戏担某杨射魔遇鱼陆级坏忘乡鲜哭费抓叶醒族纳床咱桌境列午振抱专毫店街怒托剧置秋藏赵划普岛较承脱革忍伸份免齐抗猛园临犯食架选歌按败良隐养属洛朱狂修坚压寻旅谋温探资端投泪阴换药麻施丈冰雄著绿职负短模荣遗农叹川毒吴蒋卖范禁杂富秀县祖梅谷凡刺登蓝奶缓姓牛价规篇劳质婆仙馆摆舞层狗占墙善熟验肉臣状呆圣懂袋唱值迷替归巨讨毕批镇吸森拍灭握伊杰勒卷偷奔省谓危付伦休厅预迎罢恨博亡欲悲宣标闹岸';
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
  var high = chinesePct > 0.5 && (chinesePct + commonAsciiPct) > 0.9 &&
      invalidPct === 0 && commonHanZiPct > 0.25;
  var low = chinesePct > 0.3 && (chinesePct + commonAsciiPct) > 0.8 &&
      commonHanZiPct > 0.15;
  return getScore(high, low);
}

function getScore(high, low) {
  return high && 2 || low && 1 || 0;
}

function getInvalidPct(str) {
  // count occurences of the "replacement" character
  var invalidCount = (str.match(/\ufffd/g) || []).length;
  return invalidCount / str.length;
}

function extractCommonAsciiChars(str) {
  return str.replace(/[^a-zA-Z0-9.()'"?+\n,:;/|_$% -]/g, '');
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
