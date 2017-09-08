var assert = require('assert'),
    api = require('..'),
    StringReader = require('./helpers.js').Reader;

describe('mapshaper-delim-reader.js', function () {

  describe('readDelimRecords()', function () {
    var readDelimRecords = api.internal.readDelimRecords;
    it('read several lines', function () {
      var str = 'foo,bar\r\na,b\r\nc,d\r\n';
      var records = readDelimRecords(new StringReader(str), ',');
      assert.deepEqual(records, [{foo:'a', bar:'b'}, {foo: 'c', bar: 'd'}]);
    })
  })

  describe('readDelimLines()', function () {
    var readDelimLines = api.internal.readDelimLines;

    it('empty string', function () {
      var reader = new StringReader('');
      assert.strictEqual(readDelimLines(reader, 0, ','), null);
    })
    it('empty line', function () {
      var reader = new StringReader('\n');
      assert.deepEqual(readDelimLines(reader, 0, ','), {offset:1, text: '\n'});
    })
    it('two lines separated by \\n one at a time', function () {
      var reader = new StringReader('foo,bar\na,b');
      assert.deepEqual(readDelimLines(reader, 0, ',', '', 1), {offset: 8, text: 'foo,bar\n'});
      assert.deepEqual(readDelimLines(reader, 8, ','), {offset: 11, text: 'a,b'});
    })
    it('two lines separated by \\r\\n one at a time', function () {
      var reader = new StringReader('foo,bar\r\na,b');
      assert.deepEqual(readDelimLines(reader, 0, ',', 'utf8'), {offset: 9, text: 'foo,bar\r\n'});
      assert.deepEqual(readDelimLines(reader, 9, ',', 'utf8', 1), {offset: 12, text: 'a,b'});
    })
    it('two lines, together', function () {
      var reader = new StringReader('foo,bar\na,b');
      assert.deepEqual(readDelimLines(reader, 0, ',', 'utf-8', 2), {offset: 11, text: 'foo,bar\na,b'});
    })
    it('quoted string, containing delim and eol', function () {
      var reader = new StringReader('foo,bar\n"a,","\nb"');
      assert.deepEqual(readDelimLines(reader, 8, ',', 'latin1'), {offset: 17, text: '"a,","\nb"'});
    })
    it('quoted field, containing escaped quote', function () {
      var reader = new StringReader('"foo ""\n",bar');
      assert.deepEqual(readDelimLines(reader, 0, ','), {offset: 13, text: '"foo ""\n",bar'});
    })
  })


});