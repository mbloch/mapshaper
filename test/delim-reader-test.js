var assert = require('assert'),
    api = require('..'),
    csv_spectrum = require('csv-spectrum'),
    StringReader = require('./helpers.js').Reader;

describe('mapshaper-delim-reader.js', function () {

  describe('readDelimRecordsFromString()', function () {
    var read = api.internal.readDelimRecordsFromString;
    it('simple test', function () {
      var output = read('a,b,c\n1,2,3', ',', {});
      assert.deepEqual(output, [{a: '1', b: '2', c: '3'}]);
    })

    it('simple test', function () {
      var output = read('a,b,c\n1,2,3', ',', {});
      assert.deepEqual(output, [{a: '1', b: '2', c: '3'}]);
    })
  })


  describe('readDelimRecords()', function () {
    var readDelimRecords = api.internal.readDelimRecords;
    it('read several lines', function () {
      var str = 'foo,bar\r\na,b\r\nc,d\r\n';
      var records = readDelimRecords(new StringReader(str), ',');
      assert.deepEqual(records, [{foo:'a', bar:'b'}, {foo: 'c', bar: 'd'}]);
    })
  })

  csv_spectrum(function(err, data) {
    describe('readDelimRecords() csv-spectrum tests', function() {
      data.forEach(function(d) {
        it('csv-spectrum ' + d.name, function() {
          var reader = new api.internal.BufferReader(d.csv);
          var records = api.internal.readDelimRecords(reader, ',');
          assert.deepEqual(records, JSON.parse(d.json));
        });
      });
    })
  });

  describe('readDelimRecords()', function () {
    var read = api.internal.readDelimRecords;

    it('csv_file_names option', function() {
      var str = 'a,b\n1,2';
      var records = read(new StringReader(str), ',', {csv_field_names: ['foo', 'bar']});
      assert.deepEqual(records, [{foo: 'a', bar: 'b'}, {foo: '1', bar: '2'}])
    });

    it('csv_skip_lines option', function() {
      var str = '\nSome text\n\na,b\n1,2'; // lines of junk
      var records = read(new StringReader(str), ',', {csv_skip_lines: 3});
      assert.deepEqual(records, [{a: '1', b: '2'}])
    });

    it('csv_skip_lines and csv_file_names options', function() {
      // assign new field names by skipping the existing names and assigning names
      var str = 'a,b\n1,2';
      var records = read(new StringReader(str), ',', {csv_field_names: ['foo', 'bar'], csv_skip_lines: 1});
      assert.deepEqual(records, [{foo: '1', bar: '2'}])
    });

    it('parse test 1: missing and extra fields', function () {
      var str = 'foo,bar\r\na,b,c\r\n,\r\n\r\ncd'; // various issues: extra field, missing fields
      var records = read(new StringReader(str), ',');
      assert.deepEqual(records, [{foo: 'a', bar: 'b'}, {foo: '', bar: ''}, {foo: '', bar: ''}, {foo: 'cd', bar: ''}]);
    });

    it('reading from a file (testing buffer expansion)', function() {
      var file = 'test/test_data/text/states.csv';
      var reader1 = new api.internal.FileReader(file);
      var reader2 = new api.internal.FileReader(file, {bufferSize: 64}); // start with tiny buffer, to test buffer expansion
      var records1 = read(reader1, ',');
      var records2 = read(reader2, ',', {batch_size: 2}); // small batch size, to test batches
      // fields: STATE_NAME,STATE_FIPS,SUB_REGION,STATE_ABBR,POP2010,POP10_SQMI
      assert.deepEqual(records2[0], {STATE_NAME: 'Alabama', STATE_FIPS: '01', SUB_REGION: 'East South Central', STATE_ABBR:'AL', POP2010: '4779736', POP10_SQMI: '92.50'});
      assert.deepEqual(records1, records2);
    });
  })

  describe('parseDelimText() object output', function () {
    it('simple test', function() {
      var convert = api.internal.getRowConverter(['a', 'b', 'c']);
      var str = '1|2|3\r4|5|6';
      var records = api.internal.parseDelimText(str, '|', convert);
      assert.deepEqual(records, [{a: '1', b: '2', c: '3'}, {a: '4', b: '5', c: '6'}]);
    })
  });

  describe('parseDelimText() object output with column filter', function () {
    it('test1', function() {
      var colFilter = api.internal.getDelimFieldFilter(['a', 'b', 'c'], ['b']);
      var convert = api.internal.getRowConverter(['b']);
      var str = '1\t2\t3\n4\t5\t6';
      var records = api.internal.parseDelimText(str, '\t', convert, colFilter);
      assert.deepEqual(records, [{b: '2'}, {b: '5'}]);
    })

     it('test1', function() {
      var colFilter = api.internal.getDelimFieldFilter(['a', 'b', 'c'], ['a', 'c']);
      var convert = api.internal.getRowConverter(['a', 'c']);
      var str = '1\t2\t3\n4\t5\t6';
      var records = api.internal.parseDelimText(str, '\t', convert, colFilter);
      assert.deepEqual(records, [{a: '1', c: '3'}, {a: '4', c: '6'}]);
    })
  });

  describe('parseDelimText() array output', function () {
    var parse = api.internal.parseDelimText;
    function test(str, target, delim) {
      delim = delim || ',';
      assert.deepEqual(api.internal.parseDelimText(str, delim), target);
    }

    it('retains spaces', function () {
      test('a,b,c\na , b, c ', [['a', 'b', 'c'], ['a ', ' b', ' c ']])
    })

    it('handles trailing CR', function() {
      test('a,b,c\r', [['a', 'b', 'c']]);
    })

    it('handles quoted strings', function () {
      test('"a","","a ""b"" c"," "', [['a', '', 'a "b" c', ' ']])
    })

    it('final newline is ignored', function () {
      test('a,b,c\r\n', [['a', 'b', 'c']])
    })

    it('handles quoted delimiters and newlines as text', function() {
      test('a,"b\n\r,c",d', [['a', 'b\n\r,c', 'd']])
    })

    it('handles CR, LF and CRLF line terminators', function() {
      test('a\nb\rc\r\nd', [['a'], ['b'], ['c'], ['d']])
    })
  })

});
