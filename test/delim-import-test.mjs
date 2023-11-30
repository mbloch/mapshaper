import api from '../mapshaper.js';
import assert from 'assert';
import helpers from './helpers';
import fs from 'fs';

var internal = api.internal,
    utils = api.utils,
    fixPath = helpers.fixPath;

function stringifyEqual(a, b) {
  assert.equal(JSON.stringify(a), JSON.stringify(b));
}

describe('mapshaper-delim-import.js', function() {

  describe('Auto-detecting UTF-8 and UTF-16 with BOM', function () {
    var content = `election_dt	county_name	polling_place_id	polling_place_name	precinct_name	house_num	street_name	city	state	zip
11/05/2019	ALAMANCE	1	ALAMANCE CIVITAN CLUB HOUSE	COBLE	3328	DOCTOR PICKETT RD	BURLINGTON	NC	27215`;

    it('utf16be sample', function (done) {
      var cmd = '-i test/data/text/utf16_le_bom.csv -o out.tsv'; //
      api.applyCommands(cmd, {}, function(err, output) {
        assert.equal(output['out.tsv'], content);
        done();
      });
    })

    it('utf16le sample', function (done) {
      var cmd = '-i test/data/text/utf16_be_bom.csv -o out.tsv'; //
      api.applyCommands(cmd, {}, function(err, output) {
        assert.equal(output['out.tsv'], content);
        done();
      });
    })

    it('utf8 sample', function (done) {
      var cmd = '-i test/data/text/utf8_bom.csv -o out.tsv'; //
      api.applyCommands(cmd, {}, function(err, output) {
        assert.equal(output['out.tsv'], content);
        done();
      });
    })
  })

  describe('csv decoding with -i', function () {

    it('-i csv-dedup-fields', function(done) {
      var csv = 'foo,foo,foo\na,b,c';
      var cmd = '-i csv-dedup-fields csv.csv -o';
      api.applyCommands(cmd, {'csv.csv': csv}, function(err, out) {
        var str = out['csv.csv'];
        assert.equal(str, 'foo1,foo2,foo3\na,b,c');
        done();
      });
    })

    it('-i csv-lines= csv-field-names= csv-fields= options', function(done) {
      var cmd = '-i test/data/text/states.csv csv-fields=A,D ' +
        'csv-field-names=A,B,C,D,E,F csv-skip-lines=1 csv-lines=2 -o format=json';
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['states.json']);
        assert.deepEqual(json, [{ A: 'Alabama', D: 'AL' }, { A: 'Alaska', D: 'AK' }]);
        done();
      })
    });

    it('-i field-types= works with :str type hint', function (done) {
      var input = "fips\n00001";
      api.applyCommands('-i field-types=fips:str', input, function(err, output) {
        if (err) throw err;
        assert.equal(err, null);
        assert.equal(output, "fips\n00001");
        done();
      });
    })

    it('handle missing values in numeric fields', function(done) {
      var target = `Residence_Addresses_Latitude,Residence_Addresses_Longitude,Residence_Addresses_LatLongAccuracy,County,Voters_FIPS,Precinct
38.25722,-119.226515,GeoMatch5Digit,MONO,051,BRIDGEPORT
,,,MONO,051,BRIDGEPORT`;
      api.applyCommands('-i test/data/text/empty_fields.csv string-fields=Voters_FIPS -info -o data.csv',  function(err, out) {
        var output = out['data.csv'].toString();
        assert.equal(output, target);
        done();
      });
    })

    it('handle missing values in numeric fields 2', function(done) {
      var target = `County,Voters_FIPS,Precinct,Residence_Addresses_Latitude,Residence_Addresses_Longitude,Residence_Addresses_LatLongAccuracy
LOS ANGELES,037,ALTADENA-0046,34.1911,-118.158,GeoMatchRooftop
LOS ANGELES,037,ALTADENA-0048,,,`;
      api.applyCommands('-i test/data/text/empty_fields2.csv string-fields=Voters_FIPS  -o data.csv',  function(err, out) {
        var output = out['data.csv'].toString();
        assert.equal(output, target);
        done();
      });
    })

    it('filter fields with csv-fields= option', function(done) {
      var target = `County,Residence_Addresses_Latitude,Residence_Addresses_Longitude
LOS ANGELES,34.1911,-118.158
LOS ANGELES,,`;
      api.applyCommands('-i test/data/text/empty_fields2.csv csv-fields=County,Residence_Addresses_Latitude,Residence_Addresses_Longitude  -o data.csv',  function(err, out) {
          var output = out['data.csv'].toString();
          assert.equal(output, target);
          done();
        });
      })

    it('handle empty files', function(done) {
      api.applyCommands('-i empty.csv -o', {'empty.csv': ''}, function(err, out) {
        assert(!err);
        assert.strictEqual(out['empty.csv'], '');
        done();
      });
    });

    it('handle files with no data rows', function(done) {
      api.applyCommands('-i empty.csv -o', {'empty.csv': 'ID,STATE,VALUE'}, function(err, out) {
        assert(!err);
        // field names are lost
        assert.strictEqual(out['empty.csv'], '');
        done();
      });
    });

    it('missing fields are filled out with nulls', function(done) {
      api.applyCommands('-i test.csv -o', {'test.csv': 'ID,STATE,VALUE\n1\n2,WA,300'}, function(err, out) {
        assert(!err);
        assert.strictEqual(out['test.csv'], 'ID,STATE,VALUE\n1,,\n2,WA,300');
        done();
      });
    });

    it('extra fields are dropped', function(done) {
      api.applyCommands('-i test.csv -o', {'test.csv': 'ID,STATE\n1,OR,3000\n2,WA'}, function(err, out) {
        assert(!err);
        assert.strictEqual(out['test.csv'], 'ID,STATE\n1,OR\n2,WA');
        done();
      });
    });

    it('latin-1', function (done) {
      var buf = internal.encodeString('chars,chars2\r\n»¼ü©Å÷,è绿', 'latin1');
      api.applyCommands('-i chars.csv encoding=latin1 -o out.tsv', {'chars.csv': buf}, function(err, output) {
        assert.equal(output['out.tsv'], 'chars\tchars2\n»¼ü©Å÷\tè?');
        done();
      })
    })

    it('big5', function (done) {
      var buf = internal.encodeString('a|b\r\n長生殿|彈詞', 'big5');
      api.applyCommands('-i chars.csv encoding=big5 -o delimiter=; out.csv', {'chars.csv': buf}, function(err, output) {
        assert.equal(output['out.csv'], 'a;b\n長生殿;彈詞');
        done();
      })
    })
  })


  function importRecords(str, opts) {
    var dataset = api.internal.importDelim(str, opts);
    return dataset.layers[0].data.getRecords();
  }

  describe('importDelim()', function() {
    it('handle empty  fields', function() {
      var csv = "number,name\n3,foo\n,\n";
      var records = importRecords(csv);
      var target = [{number: 3, name: 'foo'}, {number: null, name: ''}];
      assert.deepStrictEqual(records, target);
    })

    it('detect numeric field when first record is empty', function() {
      var str = 'a,b,c\n,"",0\n3,4,5';
      var records = importRecords(str);
      var target = [{a:null, b:null, c:0}, {a:3, b:4, c:5}];
      assert.deepStrictEqual(records, target);
    })

    it('detect numeric field when whitespace is present', function() {
      var str = 'a\tb\tc\n 3\t4 \t  5  ';
      var records = importRecords(str);
      var target = [{a:3, b:4, c:5}];
      assert.deepStrictEqual(records, target);
    })

    it('detect numeric field when field contains "NA" (from R export) or "NaN"', function() {
      var str = 'a,b,c,d\n  NA,4,NA,NaN\n3,"NA",NA,9';
      var records = importRecords(str);
      var target = [{a:null, b:4, c:"NA", d: null}, {a:3, b:null, c:"NA", d: 9}];
      assert.deepStrictEqual(records, target);
    })

    it('detect string field when first value looks like a number', function() {
      var str = 'a,b\n2,0\n4a,8x';
      var records = importRecords(str);
      var target = [{a:'2', b:'0'}, {a:'4a', b:'8x'}];
      assert.deepStrictEqual(records, target);
    })

    it('retain whitespace in string fields', function() {
      var str = 'a,b,c\n" ", , a ';
      var records = importRecords(str);
      var target = [{a:' ', b:' ', c:' a '}];
      assert.deepStrictEqual(records, target);
    })

    it('type hints prevent auto-detection of number fields', function() {
      var str = 'a\tb\tc\n3\t4\t5';
      var records = importRecords(str, {field_types: ['a:str','b:string']});
      var target = [{a:"3", b:"4", c:5}];
      assert.deepStrictEqual(records, target);
    })

    it('type hints force numeric conversion', function() {
      var str = 'a\tb\tc\nfour\t\t5';
      var records = importRecords(str, {field_types: ['a:num','b:number']});
      var target = [{a:null, b:null, c:5}];
      assert.deepStrictEqual(records, target);
    })

    it('ignore unnamed columns', function() {
      stringifyEqual(importRecords('\n\n'), [{}]);
      stringifyEqual(importRecords(',foo,\na,b,c\n'), [{foo:'b'}]);
    })

    it('ignore whitespace column names', function() {
      stringifyEqual(importRecords(' ,  ,foo, \na,b,c,d\n'), [{foo: 'c'}]);
    })
  })

  describe('infer export delimiter from filename, if possible', function () {
    it('.tsv implies tab-delimited text', function (done) {
      var cmd = '-i test/data/text/two_states.csv -o output.tsv';
      api.applyCommands(cmd, {}, function(err, output) {
        assert.ok(output['output.tsv'].indexOf('\t') > -1); // got tabs
        done();
      })
    })

    it('use input delimiter if export filename is ambiguous', function (done) {
      var cmd = '-i test/data/text/two_states.csv -o output.txt';
      api.applyCommands(cmd, {}, function(err, output) {
        var o = output[0];
        assert.ok(output['output.txt'].indexOf(',') > -1); // got commas
        done();
      })
    })

    it('use comma as default delimiter if other methods fail', function (done) {
      var cmd = '-i test/data/two_states.shp -o output.txt';
      api.applyCommands(cmd, {}, function(err, output) {
        var o = output[0];
        assert.ok(output['output.txt'].indexOf(',') > -1); // got commas
        done();
      })
    })

    it('.csv in output filename implies comma-delimited text', function (done) {
      var cmd = '-i test/data/text/two_states.tsv -o output.csv';
      api.applyCommands(cmd, {}, function(err, output) {
        var o = output[0];
        assert.ok(output['output.csv'].indexOf(',') > -1); // got commas
        done();
      })
    })
  })

  describe('Importing dsv with encoding= option', function() {
    it ('utf16 (be)', function(done) {
      var cmd = '-i test/data/text/utf16.txt encoding=utf16';
      api.internal.testCommands(cmd, function(err, data) {
        assert.deepEqual(data.layers[0].data.getRecords(), [{NAME: '国语國語'}])
        done();
      });
    })

    it ('utf16 (be) with BOM', function(done) {
      var cmd = '-i test/data/text/utf16bom.txt encoding=utf16';
      api.internal.testCommands(cmd, function(err, data) {
        var rec = data.layers[0].data.getRecords()[0];
        assert.deepEqual(rec, {NAME: '国语國語'})
        done();
      });
    })

    it ('utf16be with BOM', function(done) {
      var cmd = '-i test/data/text/utf16bom.txt encoding=utf-16be';
      api.internal.testCommands(cmd, function(err, data) {
        var rec = data.layers[0].data.getRecords()[0];
        assert.deepEqual(rec, {NAME: '国语國語'})
        done();
      });
    })

    it ('utf16le with BOM', function(done) {
      var cmd = '-i test/data/text/utf16le_bom.txt encoding=utf16le';
      api.internal.testCommands(cmd, function(err, data) {
        var rec = data.layers[0].data.getRecords()[0];
        assert.deepEqual(rec, {NAME: '国语國語'})
        done();
      });
    })

    it ('utf8 with BOM', function(done) {
      var cmd = '-i test/data/text/utf8bom.txt';
      api.internal.testCommands(cmd, function(err, data) {
        var rec = data.layers[0].data.getRecords()[0];
        assert.deepEqual(rec, {NAME: '国语國語'})
        done();
      });
    })

  })


  describe('parseNumber()', function() {
    it('undefined -> null', function() {
      assert.strictEqual(utils.parseNumber(undefined), null);
    })

    it ('"" -> null', function() {
      assert.strictEqual(utils.parseNumber(""), null);
    })

    it ('"1e3" -> 1000', function() {
      assert.equal(utils.parseNumber('1e3'), 1000);
    })

    it (',, -> null', function() {
      assert.strictEqual(utils.parseNumber(',,'), null);
    })

    it (', -> null', function() {
      assert.strictEqual(utils.parseNumber(','), null);
    })

    it ('. -> null', function() {
      assert.strictEqual(utils.parseNumber('.'), null);
    })

    it('parses decimal numbers', function() {
      assert.equal(utils.parseNumber('-43.2'), -43.2)
    })

    it('parses decimal numbers with positive sign', function() {
      assert.equal(utils.parseNumber('+43.2'), 43.2)
    })

    it('parses numbers with spaces', function() {
      assert.equal(utils.parseNumber('-2.0  '), -2)
      assert.strictEqual(utils.parseNumber('  0'), 0)
    })

    it('identifies numbers with comma delimiters', function() {
      assert.strictEqual(utils.parseNumber('3,211'), 3211)
      assert.strictEqual(utils.parseNumber('-2,000,000.0  '), -2e6)
    })

    it('identifies scientific notation', function() {
      assert.strictEqual(utils.parseNumber('1.3e3'), 1.3e3);
    })

    it('reject alphabetic words', function() {
      assert.strictEqual(utils.parseNumber('Alphabet'), null)
    })

    it('parse hex numbers', function() {
      assert.strictEqual(utils.parseNumber('0xcc'), 0xcc);
    })

    it('reject empty strings', function() {
      assert.strictEqual(utils.parseNumber(''), null)
      assert.strictEqual(utils.parseNumber(' '), null)
    })

    it('rejects street addresses', function() {
      assert.strictEqual(utils.parseNumber('312 Orchard St'), null);
    })

    it('rejects dates', function() {
      assert.strictEqual(utils.parseNumber('2013-12-03'), null);
    })
  })

  describe('parseIntlNumber()', function() {
    it('csv-decimal-comma option', function(done) {
      var csv = 'num\n"20,1"\n"-5,0"';
      var cmd = '-i data.csv decimal-comma -o format=json';
      api.applyCommands(cmd, {'data.csv': csv}, function(err, out) {
        assert.deepEqual(JSON.parse(out['data.json']), [{num: 20.1}, {num: -5}]);
        done();
      });
    })


    it('comma decimal', function() {
      assert.equal(utils.parseIntlNumber('123,10'), 123.10);
    })

    it('point separator', function() {
      assert.equal(utils.parseIntlNumber('1.000.000'), 1e6);
    })

    it('point and comma', function() {
      assert.equal(utils.parseIntlNumber('1.000.000,5'), 1000000.5);
    })

    it('space and comma', function() {
      assert.equal(utils.parseIntlNumber('1 000 000,5'), 1000000.5);
    })
  })


  describe('guessDelimiter()', function () {
    it('guesses CSV', function () {
      assert.equal(api.internal.guessDelimiter("a,b\n1,2"), ',');
    })

    it("guesses TSV", function() {
      assert.equal(api.internal.guessDelimiter("a\tb\n1,2"), '\t');
    })

    it("guesses pipe delim", function() {
      assert.equal(api.internal.guessDelimiter("a|b\n1,2"), '|');
    })

    it("guesses semicolon delim", function() {
      assert.equal(api.internal.guessDelimiter("a;b\n1;2"), ';');
    })
  })

  describe('getFieldTypeHints()', function () {
    it('identify number and string types', function () {
      var opts = {field_types: "fips:string,count:number,other".split(',')};
      var index = api.internal.getFieldTypeHints(opts);
      assert.deepEqual(index, {fips: 'string', count: 'number'})
    })

    it('accept alternate type names', function () {
      var opts = {field_types: "fips:s,count:n,other:STR".split(',')};
      var index = api.internal.getFieldTypeHints(opts);
      assert.deepEqual(index, {fips: 'string', count: 'number', other: 'string'})
    })

    it('accept + prefix for numeric types', function () {
      var opts = {field_types: "+count,+other".split(',')};
      var index = api.internal.getFieldTypeHints(opts);
      assert.deepEqual(index, {count: 'number', other: 'number'})
    })

    it('accept inconsistent type hints', function () {
      var opts = {field_types: "fips,count,fips:str".split(',')};
      var index = api.internal.getFieldTypeHints(opts);
      assert.deepEqual(index, {fips: 'string'})
    })

    it('accept inconsistent type hints 2', function () {
      var opts = {field_types: "fips:str,count,fips".split(',')};
      var index = api.internal.getFieldTypeHints(opts);
      assert.deepEqual(index, {fips: 'string'})
    })
  })

  describe('adjustRecordTypes()', function () {
    it('convert numbers by default', function () {
      var records = [{foo:"0", bar:"4,000,300", baz: "0xcc", goo: '300 E'}];
      api.internal.adjustRecordTypes(records);
      stringifyEqual(records, [{foo:0, bar:4000300, baz: 0xcc, goo: '300 E'}])
    })

    it('protect string-format numbers with type hints', function() {
      var records = [{foo:"001", bar:"001"}],
          opts = {field_types: ['foo:string', 'bar']};
      api.internal.adjustRecordTypes(records, opts);
      stringifyEqual(records, [{foo:"001", bar:1}])
    })

    it('protect string-format numbers with string-fields= option', function() {
      var records = [{foo:"001", bar:"001"}],
          opts = {string_fields: ['foo']};
      api.internal.adjustRecordTypes(records, opts);
      stringifyEqual(records, [{foo:"001", bar:1}])
    })

    it('string-fields=* matches all fields', function() {
      var records = [{foo:"001", bar:"001"}],
          opts = {string_fields: ['*']};
      api.internal.adjustRecordTypes(records, opts);
      stringifyEqual(records, [{foo:"001", bar:"001"}])
    })

    it('bugfix 1: handle numeric data (e.g. from dbf)', function() {
      var records = [{a: 0, b: 23.2, c: -12}],
          opts = {field_types: ['a', 'b:number', 'c']};
      api.internal.adjustRecordTypes(records, opts);
      stringifyEqual(records, [{a: 0, b: 23.2, c: -12}])
    })

  })


  describe('importDelim2()', function () {
    it('import from a file', function () {
      var input = {
        filename: 'test/data/text/states.csv'
      };
      var output = api.internal.importDelim2(input);
      var records = output.layers[0].data.getRecords();
      assert.equal(records.length, 52)
      assert.deepEqual(records[0], {
        STATE_NAME: 'Alabama',
        STATE_FIPS: 1,
        SUB_REGION: 'East South Central',
        STATE_ABBR: 'AL',
        POP2010: 4779736,
        POP10_SQMI: 92.5
      })
    })

    it('import file with filter', function () {
      var input = {
        filename: 'test/data/text/states.csv'
      };
      var opts = {
        csv_filter: 'STATE_NAME == "Colorado"'
      };
      var output = api.internal.importDelim2(input, opts);
      var records = output.layers[0].data.getRecords();
      assert.equal(records.length, 1)
      assert.deepEqual(records[0], {
        STATE_NAME: 'Colorado',
        STATE_FIPS: 8,
        SUB_REGION: 'Mountain',
        STATE_ABBR: 'CO',
        POP2010: 5029196,
        POP10_SQMI: 48.30
      })
    })

    it('import string with filter', function () {
      var str = fs.readFileSync('test/data/text/states.csv', 'utf8');
      var input = {
        content: str
      };
      var opts = {
        csv_filter: 'STATE_NAME == "Colorado"',
        csv_fields: 'STATE_NAME,SUB_REGION,POP2010,POP10_SQMI'.split(',')
      };
      var output = api.internal.importDelim2(input, opts);
      var records = output.layers[0].data.getRecords();
      assert.equal(records.length, 1)
      assert.deepEqual(records[0], {
        STATE_NAME: 'Colorado',
        SUB_REGION: 'Mountain',
        POP2010: 5029196,
        POP10_SQMI: 48.30
      })
    })

  })

  describe('importDelim()', function () {
    it('apply row filter before counting lines', function() {
      var str = 'foo\na\nb\nc\nd\ne\nf';
      var dataset = api.internal.importDelim(str, {csv_lines: 2, csv_filter:'foo != "a" && foo != "c"'});
      var arr = dataset.layers[0].data.getRecords();
      assert.deepEqual(arr, [{foo: 'b'}, {foo: 'd'}])
    })

    it('should detect tab delimiter', function () {
      var str = 'a\tb\n1\t"boo ya"'
      var dataset = api.internal.importDelim(str);
      stringifyEqual(dataset.layers[0].data.getRecords(), [{a: 1, b: 'boo ya'}]);
      assert.equal(dataset.info.input_delimiter, '\t')
    })

    it('comma delim', function () {
      var str = 'a,b\n"1","2"';
      var data = api.internal.importDelim(str);
      stringifyEqual(data.layers[0].data.getRecords(), [{a: 1, b: 2}]);
    })

    it('missing string field is imported as empty string', function() {
      var str = 'a,b\nc,d\ne';
      var data = api.internal.importDelim(str);
      assert.deepStrictEqual(data.layers[0].data.getRecords(), [{a: 'c', b: 'd'}, {a: 'e', b: ''}])
    });

    it('missing number is imported as null', function() {
      var str = 'a,b\n,1\n2,3';
      var data = api.internal.importDelim(str);
      assert.deepStrictEqual(data.layers[0].data.getRecords(), [{a: null, b: 1}, {a: 2, b: 3}])
    });

    it('parse csv with quoted field including comma', function () {
      var str = 'a,b\n1,"foo, bar"'
      var data = api.internal.importDelim(str);
      stringifyEqual(data.layers[0].data.getRecords(), [{a: 1, b: 'foo, bar'}]);
    })

    it('import tab-delim, quoted string', function () {
      var str = 'a\tb\n1\t"boo ya"'
      var data = api.internal.importDelim(str);
      stringifyEqual(data.layers[0].data.getRecords(), [{a: 1, b: 'boo ya'}]);
    })

    it('import pipe-delim, trailing newline', function () {
      var str = 'a|b\n1|"boo"\n'
      var data = api.internal.importDelim(str);
      stringifyEqual(data.layers[0].data.getRecords(), [{a: 1, b: 'boo'}]);
    })

    it('import single column of values w/ mixed return types', function () {
      var str = 'a\n1\r\n0\r30'
      var data = api.internal.importDelim(str);
      stringifyEqual(data.layers[0].data.getRecords(), [{a: 1}, {a: 0}, {a: 30}]);
    })

  })

});
