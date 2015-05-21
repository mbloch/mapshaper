var api = require('../'),
    fs = require('fs'),
    assert = require('assert');

describe('mapshaper-encodings.js', function () {
  describe('decodeString()', function () {
    it('should remove BOM', function () {
      // BOM removal also tested in delim-table-test.js
      var buf = fs.readFileSync('test/test_data/text/utf16bom.txt');
      var str = api.internal.decodeString(buf, 'utf-16');
      assert.equal(str, 'NAME\n国语國語');
    })
  })

  describe('standardizeEncodingName()', function () {
    it('UTF-8 -> utf8', function () {
      assert.equal(api.internal.standardizeEncodingName('UTF-8'), 'utf8');
    })

    it('UTF-16BE -> utf16be', function () {
      assert.equal(api.internal.standardizeEncodingName('UTF-16BE'), 'utf16be');
    })
  })

})