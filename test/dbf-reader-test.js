var api = require('../'),
    assert = require('assert'),
    iconv = require('iconv-lite'),
    Dbf = api.internal.Dbf,
    Utils = api.utils;

function fixPath(p) {
  return require('path').join(__dirname, p);
}

describe('dbf-reader.js', function () {
  var s2 = "Peçeña México",
      s3 = "简体国语",
      s4 = "繁體國語",
      s5 = "Neuchâtel Baden-Württemberg La Gruyère",
      s6 = "ひたちなか市",
      s7 = "西蒲原郡弥彦村",
      ascii = Utils.repeat(127, function(i) {return String.fromCharCode(i+1)}).join('');

  describe('#readRows', function () {

    function rows(path, encoding) {
      path = "test_data/dbfs/" + path;
      var reader = new api.internal.DbfReader(fixPath(path), encoding);
      return reader.readRows();
    }

    it("latin1", function() {
      assert.equal(rows("latin1.dbf", 'latin1')[0].NAME, s2);
    })

    it("gbk", function() {
      assert.equal(rows("gbk.dbf", 'gbk')[0].NAME, s3);
    })

    it("big5", function() {
      assert.equal(rows("big5.dbf", 'big5')[0].NAME, s4);
    })

    it("gb2312", function() {
      assert.equal(rows("gb2312.dbf", 'gb2312')[0].NAME, s3);
    })

    it("shiftjis", function() {
      var records = rows("shiftjis.dbf", 'shiftjis');
      assert.equal(records[0].NAME, s6);
      assert.equal(records[1].NAME, s7);
    })

    it("eucjp", function() {
      var records = rows("eucjp.dbf", 'eucjp');
      assert.equal(records[0].NAME, s6);
      assert.equal(records[1].NAME, s7);
    })
  })

  describe("#getStringReader", function() {
    function test(str, encoding) {
      // TODO: rethink this... iconv roundtrip not a reliable test
      var buf = iconv.encode(str, encoding),
          bin = new api.internal.BinArray(buf),
          reader = Dbf.getStringReader(buf.length, encoding);
      return reader(bin);
    }

    it("ascii", function() {
      assert.equal(test(ascii, 'ascii'), ascii);
    })

    it("latin1", function() {
      assert.equal(test(s2, 'latin1'), s2);
      assert.equal(test(ascii, 'latin1'), ascii);
    })

    it("gbk", function() {
      assert.equal(test(s3, 'gbk'), s3);
      assert.equal(test(s4, 'gbk'), s4); // ? why does traditional work?
    })

    it("gb2312", function() {
      assert.equal(test(s3, 'gb2312'), s3);
      assert.equal(test(s4, 'gb2312'), s4); // ? why does traditional work?
    })

    it("big5", function() {
      assert.equal(test(s3, 'big5'), s3); // ? why does simplified work?
      assert.equal(test(s4, 'big5'), s4);
    })

    it("utf8", function() {
      assert.equal(test(s2, 'utf8'), s2);
      assert.equal(test(s3, 'utf8'), s3);
      assert.equal(test(s4, 'utf8'), s4);
      assert.equal(test(ascii, 'utf8'), ascii);
    })
  });
})
