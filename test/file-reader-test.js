var fs = require('fs'),
    api = require('..'),
    FileReader = api.internal.FileReader,
    Reader = require('./helpers.js').Reader,
    assert = require('assert');

function toString(buf) {
  return buf.toString('utf8');
}


describe('test Reader', function () {
  it('chunk len greater than buf len', function() {
    var str = "foo bar";
    var r = new Reader(str, 256);
    assert.equal(r.getBuffer(0).toString('utf8'), str);
  })

  it('chunk len less than buf len', function() {
    var str = "foo bar";
    var r = new Reader(str, 4);
    assert.equal(r.getBuffer(0).toString('utf8'), "foo ");
    r.expandBuffer();
    assert.equal(r.getBuffer(0).toString('utf8'), "foo bar");
  })
})

describe('mapshaper-file-reader.js', function () {

  describe('FileReader', function () {
    it('buffer larger than file cache', function () {
      var reader = new FileReader('test/test_data/lorem.txt', {cacheSize: 2, bufferSize: 4});
      assert.equal(toString(reader.getBuffer(2)), 'rem ');
      assert.equal(toString(reader.getBuffer(0)), 'lore'); // go back in file
      reader.expandBuffer();
      assert.equal(toString(reader.getBuffer(0)), 'lorem ip');
      assert.equal(toString(reader.expandBuffer().getBuffer(0)), 'lorem ipsum'); // end of file
    })

    it('file cache larger than file', function () {
      var reader = new FileReader('test/test_data/lorem.txt', {cacheSize: 0x1000, bufferSize: 2});
      assert.equal(toString(reader.getBuffer(2)), 're');
      assert.equal(toString(reader.expandBuffer().getBuffer(6)), 'ipsu');
      assert.equal(toString(reader.expandBuffer().getBuffer(10)), 'm'); // end of file
      assert.equal(toString(reader.getBuffer(0)), 'lorem ip'); // go back in file
    })

    it('buffer same size as file', function () {
      var reader = new FileReader('test/test_data/lorem.txt', {cacheSize: 0x1000, bufferSize: 11});
      assert.equal(toString(reader.getBuffer(0)), 'lorem ipsum');
      assert.equal(toString(reader.getBuffer(1)), 'orem ipsum');
      assert.equal(toString(reader.getBuffer(2)), 'rem ipsum');
      assert.equal(toString(reader.getBuffer(10)), 'm');
    })

    it('try to read beyond file end', function() {
      var reader = new FileReader('test/test_data/lorem.txt', {cacheSize: 0x1000, bufferSize: 12});
      assert.equal(toString(reader.getBuffer(11)), ''); // at eof: return empty buffer
      assert.throws(function() {
        reader.getBuffer(12);
      });
    })
  })


  describe('#findString()', function () {
    it('test1', function () {
      var json = '{"type": "FeatureCollection", "features": []}';
      var reader = new Reader(json);
      var target = {
        text: '{"type": "FeatureCollection", ',
        offset: 40
      };
      assert.deepEqual(reader.findString('"features"'), target);
    })

    it('test2', function () {
      var json = '{"type": "FeatureCollection", "features": []}';
      var reader = new Reader(json);
      var target = {
        text: '{"type": ',
        offset: 28
      };
      assert.deepEqual(reader.findString('"FeatureCollection"'), target);
    })

  })

})
