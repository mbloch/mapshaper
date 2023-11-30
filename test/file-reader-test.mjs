import fs from 'fs';
import api from '../mapshaper.js';
import assert from 'assert';
import helpers from './helpers';
var FileReader = api.internal.FileReader,
    Reader = helpers.Reader;


function toString(buf) {
  return buf.toString('utf8');
}

describe('test Reader', function () {
  it('chunk len greater than buf len', function() {
    var str = "foo bar";
    var r = new Reader(str, 256);
    assert.equal(r.readSync(0).toString('utf8'), str);
  })

  it('chunk len less than buf len', function() {
    var str = "foo bar";
    var r = new Reader(str, 4);
    assert.equal(r.readSync(0).toString('utf8'), "foo ");
    r.expandBuffer();
    assert.equal(r.readSync(0).toString('utf8'), "foo bar");
  })
})

describe('mapshaper-file-reader.js', function () {

    it('buffer larger than file cache', function () {
      var reader = new FileReader('test/data/text/lorem.txt', {cacheSize: 2, bufferSize: 4});
      assert.equal(toString(reader.readSync(2)), 'rem ');
      assert.equal(toString(reader.readSync(4)), 'm ip');
      assert.equal(toString(reader.readSync(7)), 'psum');
      assert.equal(toString(reader.readSync(0)), 'lore'); // go back in file
      assert.equal(toString(reader.readSync(4)), 'm ip'); // skip forward
      assert.equal(toString(reader.readSync(1)), 'orem'); // go back in file
      assert.equal(toString(reader.readSync(6)), 'ipsu'); // skip forward
      reader.expandBuffer();
      assert.equal(toString(reader.readSync(0)), 'lorem ip');
      assert.equal(toString(reader.expandBuffer().readSync(0)), 'lorem ipsum'); // end of file
    })


  describe('FileReader', function () {

    it('file cache larger than file', function () {
      var reader = new FileReader('test/data/text/lorem.txt', {cacheSize: 0x1000, bufferSize: 2});
      assert.equal(toString(reader.readSync(2)), 're');
      assert.equal(toString(reader.expandBuffer().readSync(6)), 'ipsu');
      assert.equal(toString(reader.expandBuffer().readSync(10)), 'm'); // end of file
      assert.equal(toString(reader.readSync(0)), 'lorem ip'); // go back in file
    })

    it('buffer same size as file', function () {
      var reader = new FileReader('test/data/text/lorem.txt', {cacheSize: 0x1000, bufferSize: 11});
      assert.equal(toString(reader.readSync(0)), 'lorem ipsum');
      assert.equal(toString(reader.readSync(1)), 'orem ipsum');
      assert.equal(toString(reader.readSync(2)), 'rem ipsum');
      assert.equal(toString(reader.readSync(10)), 'm');
    })

    it('try to read beyond file end', function() {
      var reader = new FileReader('test/data/text/lorem.txt', {cacheSize: 0x1000, bufferSize: 12});
      assert.equal(toString(reader.readSync(11)), ''); // at eof: return empty buffer
      assert.throws(function() {
        reader.readSync(12);
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
