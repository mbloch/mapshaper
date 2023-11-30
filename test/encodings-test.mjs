import api from '../mapshaper.js';
import assert from 'assert';
import fs from 'fs';

var internal = api.internal;
var utils = api.utils;

describe('mapshaper-encodings.js', function () {

  describe('cli.readFile() accepts encoding param', function () {
    it('trims BOM', function () {
      // BOM removal also tested in delim-table-test.js
      var str = api.cli.readFile('test/data/text/utf16bom.txt', 'utf-16');
      assert.equal(str, 'NAME\n国语國語');
    })
  })

  describe('decodeString()', function () {
    it('utf-16 example', function () {
      var buf = fs.readFileSync('test/data/text/utf16.txt');
      var str = api.internal.decodeString(buf, 'utf-16');
      assert.equal(str, 'NAME\n国语國語');
    })
  })

  describe('encodeString()', function () {
    it('utf-16', function () {
      assert.equal(internal.decodeString(internal.encodeString('有朋自远方来', 'utf-16'), 'utf16'), '有朋自远方来');
    })
  })

  describe('bufferToString()', function () {
    it('accepts start and end arguments', function () {
      var buf = utils.createBuffer('012345678')
      assert.equal(internal.bufferToString(buf, 'utf8', 2, 3), '2');
    })

    it('start and end positions are byte positions, not character positions', function () {
      var buf = utils.createBuffer('...朋友 ')
      assert.equal(internal.bufferToString(buf, 'utf8', 3, 9), '朋友');
    })

  })

  describe('encodingIsSupported()', function () {
    it('ISO-8859-7', function () {
      assert.ok(internal.encodingIsSupported('ISO-8859-7'));
    })
  })

  describe('standardizeEncodingName()', function () {
    it('UTF-8 -> utf8', function () {
      assert.equal(internal.standardizeEncodingName('UTF-8'), 'utf8');
    })

    it('UTF-16BE -> utf16be', function () {
      assert.equal(internal.standardizeEncodingName('UTF-16BE'), 'utf16be');
    })
  })

  describe('encodingIsUtf8()', function() {
    it('positive examples', function() {
      assert(internal.encodingIsUtf8('utf-8'))
      assert(internal.encodingIsUtf8('UTF-8'))
      assert(internal.encodingIsUtf8(''))
      assert(internal.encodingIsUtf8())
    });

    it('negative examples', function() {
      assert(!internal.encodingIsUtf8('utf'))
      assert(!internal.encodingIsUtf8('UTF-16'))
      assert(!internal.encodingIsUtf8('ascii'))
      assert(!internal.encodingIsUtf8('latin-1'))
    })

  })

  describe('encodingIsAsciiCompat()', function () {
    it('positive examples', function () {
      assert(internal.encodingIsAsciiCompat('utf-8'))
      assert(internal.encodingIsAsciiCompat('latin1'))
      assert(internal.encodingIsAsciiCompat(''))
      assert(internal.encodingIsAsciiCompat('ascii'))
      assert(internal.encodingIsAsciiCompat('win1253'))
      assert(internal.encodingIsAsciiCompat('gbk'))
      assert(internal.encodingIsAsciiCompat('gb18030'))
      assert(internal.encodingIsAsciiCompat('iso-8859-1'))
    })

    it('negative examples', function() {
      assert(!internal.encodingIsAsciiCompat('utf-16'))
      assert(!internal.encodingIsAsciiCompat('big-5'))
    })

  })

})