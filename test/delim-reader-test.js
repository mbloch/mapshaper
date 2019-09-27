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

  describe('readDelimRecords2', function () {
    var read1 = api.internal.readDelimRecords;
    var read2 = api.internal.readDelimRecords2;

    // note: first field of an empty line is converted to empty string;
    //   subsequent fields are converted to undefined
    //   this behavior was changed in a later version of d3-dsv
    it('parse test 1: missing and extra fields', function () {
      var str = 'foo,bar\r\na,b,c\r\n,\r\n\r\ncd'; // various issues: extra field, missing fields
      var records = read2(new StringReader(str), ',');
      assert.deepEqual(records, [{foo: 'a', bar: 'b'}, {foo: '', bar: ''}, {foo: '', bar: undefined}, {foo: 'cd', bar: undefined}]);
      assert.deepEqual(records, read1(new StringReader(str), ','));
    });

    it('reading from a file (comparing v1 and v2)', function() {
      var file = 'test/test_data/text/states.csv';
      var reader1 = new api.internal.FileReader(file);
      var reader2 = new api.internal.FileReader(file, {bufferSize: 64}); // start with tiny buffer, to test buffer expansion
      var records1 = read1(reader1, ',');
      var records2 = read2(reader2, ',', {batch_size: 2}); // small batch size, to test batches
      // fields: STATE_NAME,STATE_FIPS,SUB_REGION,STATE_ABBR,POP2010,POP10_SQMI
      assert.deepEqual(records2[0], {STATE_NAME: 'Alabama', STATE_FIPS: '01', SUB_REGION: 'East South Central', STATE_ABBR:'AL', POP2010: '4779736', POP10_SQMI: '92.50'});
      assert.deepEqual(records1, records2);
    });
  })

  describe('readDelimLines()', function () {
    var readDelimLines = api.internal.readDelimLines;

    it('empty string', function () {
      var reader = new StringReader('');
      assert.strictEqual(readDelimLines(reader, 0), null);
    })
    it('empty line', function () {
      var reader = new StringReader('\n');
      assert.deepEqual(readDelimLines(reader, 0), {offset:1, text: '\n'});
    })
    it('two lines separated by \\n one at a time', function () {
      var reader = new StringReader('foo,bar\na,b');
      assert.deepEqual(readDelimLines(reader, 0, '', 1), {offset: 8, text: 'foo,bar\n'});
      assert.deepEqual(readDelimLines(reader, 8), {offset: 11, text: 'a,b'});
    })
    it('two lines separated by \\r\\n one at a time', function () {
      var reader = new StringReader('foo,bar\r\na,b');
      assert.deepEqual(readDelimLines(reader, 0, 'utf8'), {offset: 9, text: 'foo,bar\r\n'});
      assert.deepEqual(readDelimLines(reader, 9, 'utf8', 1), {offset: 12, text: 'a,b'});
    })
    it('two lines, together', function () {
      var reader = new StringReader('foo,bar\na,b');
      assert.deepEqual(readDelimLines(reader, 0, 'utf-8', 2), {offset: 11, text: 'foo,bar\na,b'});
    })
    it('quoted string, containing delim and eol', function () {
      var reader = new StringReader('foo,bar\n"a,","\nb"');
      assert.deepEqual(readDelimLines(reader, 8, 'latin1'), {offset: 17, text: '"a,","\nb"'});
    })
    it('quoted field, containing escaped quote', function () {
      var reader = new StringReader('"foo ""\n",bar');
      assert.deepEqual(readDelimLines(reader, 0), {offset: 13, text: '"foo ""\n",bar'});
    })
  })
});
