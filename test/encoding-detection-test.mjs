import api from '../mapshaper.js';
import assert from 'assert';
var detectEncoding = api.internal.detectEncoding;
var encodeString = api.internal.encodeString;

describe('mapshaper-encoding-detection.js', function () {
  function positiveTest(str, encoding) {
    var buf = encodeString(str, encoding);
    var o = detectEncoding([buf]);
    assert.equal(o.encoding, encoding);
    assert.equal(o.confidence, 2);
  }

  function negativeTest(str, encoding, encodeAs) {
    var buf = encodeString(str, encodeAs);
    var o = detectEncoding([buf]);
    assert.notEqual(o.encoding, encoding);
  }

  it('gb18030 tests', function() {
    positiveTest('金平苗族瑶族傣族自治县罗定县鹤山县台东县邕宁县西盟佤族自治县北流县新兴县横县屏东县扶绥县高雄县江城哈尼族彝族自治县宝安县澜沧拉祜族自治县新会县', 'gb18030');
    positiveTest('万丰路马家堡西路成寿寺路南三环中路西三环南路西四环南路南三环东路小屯路丰管路方庄路丰台北路芳古路丰台路南三环西路广安路', 'gb18030');
    positiveTest('屏東以前叫阿猴高雄舊名是打狗民雄舊名是打貓台南古都赤崁樓', 'gb18030');
    negativeTest('屏東以前叫阿猴高雄舊名是打狗民雄舊名是打貓台南古都赤崁樓','gb18030','big5');
    negativeTest('屏東以前叫阿猴高雄舊名是打狗民雄舊名是打貓台南古都赤崁樓','gb18030','utf16');
    negativeTest('أذربيجانالبحرينإريترياغامبياريكيافيك', 'gb18030', 'win1256');
    negativeTest('أذربيجانالبحرينإريترياغامبياريكيافيك', 'gb18030', 'utf16');
    negativeTest('أذربيجانالبحرينإريترياغامبياريكيافيك', 'gb18030', 'utf8');
  });
});
