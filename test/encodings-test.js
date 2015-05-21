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

})