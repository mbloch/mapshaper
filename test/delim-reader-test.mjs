import assert from 'assert';
import api from '../mapshaper.js';
import helpers from './helpers';
import csv_spectrum from 'csv-spectrum';
var internal = api.internal,
    StringReader = helpers.Reader,
    Reader2 = api.internal.Reader2;

describe('mapshaper-delim-reader.js', function () {

  describe('readLinesAsString()', function () {
    it('handles newlines in quoted string', function () {
      var str = `"1942 Grand River Avenue

http://parksandrecdiner.com/

",_hours_in_detroit_273384,42.3346355,-82.98547730000001
foo
`;
      var reader = new Reader2(new StringReader(str));
      var line = api.internal.readLinesAsString(reader, 1);
      assert(/0001$/.test(line.trim()));
    })
  })


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


  describe('parseDelimHeaderSection()', function () {
    var parse = internal.parseDelimHeaderSection;
    it('simple example', function () {
      var str = 'a,b,c\n1,2,3';
      var retn = parse(str, ',', {});
      assert.deepEqual(retn, {headers: ['a', 'b', 'c'], import_fields: ['a', 'b', 'c'], remainder: '1,2,3'})
    })

    it('only header', function () {
      var str = 'a,b,c\n';
      var retn = parse(str, ',', {});
      assert.deepEqual(retn, {headers: ['a', 'b', 'c'], import_fields: ['a', 'b', 'c'], remainder: ''})
    })

    it('only header 2', function () {
      var str = 'a,b,c';
      var retn = parse(str, ',', {});
      assert.deepEqual(retn, {headers: ['a', 'b', 'c'], import_fields: ['a', 'b', 'c'], remainder: ''})
    })

    it('skip lines', function () {
      var str = ' \n\nHeader\na,b,c\n1,2,3';
      var retn = parse(str, ',', {csv_skip_lines: 3});
      assert.deepEqual(retn, {headers: ['a', 'b', 'c'], import_fields: ['a', 'b', 'c'], remainder: '1,2,3'})
    })

    // TODO: fix
    if (false) it('skip over line with quoted newline', function() {
      var str = '"comment\none","comment\ntwo"\na,b\n1,2';
      var retn = parse(str, ',', {csv_skip_lines: 1});
      assert.deepEqual(retn, {headers:['a', 'b'], import_fields: ['a', 'b', 'c'], remainder: '1,2'})
    });

    it('csv_field_names', function () {
      var str = 'a,b,c\n1,2,3';
      var retn = parse(str, ',', {csv_field_names: ['d', 'e', 'f']});
      assert.deepEqual(retn, {headers: ['d', 'e', 'f'], import_fields: ['d', 'e', 'f'], remainder: str})
    })

  })

  describe('indexOfLine()', function () {
    it('tests', function () {
      assert.equal(internal.indexOfLine('a\nb\n', 2), 2)
      assert.equal(internal.indexOfLine('a\r\nb\r\n', 2), 3)
      assert.equal(internal.indexOfLine('a\nb\n', 3), 4)
      assert.equal(internal.indexOfLine('a\nb\n', 4), -1)
      assert.equal(internal.indexOfLine('a\nb\n', 1), 0)
      assert.equal(internal.indexOfLine('a\nb\n', 0), -1)
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
      var file = 'test/data/text/states.csv';
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
