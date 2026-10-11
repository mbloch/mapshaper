import assert from 'assert';
import api from '../mapshaper.js';
import helpers from './helpers';
import csv_spectrum from 'csv-spectrum';
import iconv from 'iconv-lite';

// Use the bundle: decoding some encodings requires iconv-lite, which src/
// modules can't load when imported directly in tests
var {
  readDelimRecords,
  readDelimRecordsFromString,
  getRowConverter,
  getDelimFieldFilter,
  parseDelimText,
  BufferReader
} = api.internal;
var StringReader = helpers.Reader;

// The string-based parser that the byte-based parser replaced. Used as a
// reference for testing the byte-based parser with random input.
// One intentional difference: if a value starts with a quote mark but doesn't
// end with one, the old parser deleted its last character.
function referenceParse(text, delim) {
  var CR = 13, LF = 10, DQUOTE = 34,
      DELIM = delim.charCodeAt(0),
      inQuotedText = false,
      srcCol = -1,
      records = [],
      fieldStart, i, c, len, record;

  function endLine() {
    records.push(record);
    srcCol = -1;
  }

  function startFieldAt(j) {
    fieldStart = j;
    srcCol++;
    if (srcCol === 0) record = [];
  }

  function captureField(start, end) {
    var s;
    if (start === end) {
      s = '';
    } else if (text.charCodeAt(start) == DQUOTE) {
      s = text.slice(start+1, end - start > 1 && text.charCodeAt(end-1) == DQUOTE ? end-1 : end).replace(/""/g, '"');
    } else {
      s = text.slice(start, end);
    }
    record.push(s);
  }

  startFieldAt(0);
  for (i=0, len=text.length; i < len; i++) {
    c = text.charCodeAt(i);
    if (c == DQUOTE) {
      inQuotedText = !inQuotedText;
    } else if (inQuotedText) {
      //
    } else if (c == DELIM) {
      captureField(fieldStart, i);
      startFieldAt(i + 1);
    } else if (c == CR || c == LF) {
      captureField(fieldStart, i);
      endLine();
      if (c == CR && text.charCodeAt(i+1) == LF) {
        i++;
      }
      if (i + 1 < len) startFieldAt(i+1);
    }
  }
  if (srcCol > -1) {
    captureField(fieldStart, i);
    endLine();
  }
  return records;
}

// Records that the reference parser yields (first line is the header)
function referenceRecords(text, delim, fieldsToKeep) {
  var rows = referenceParse(text, delim);
  var header = rows.shift() || [];
  var fields = fieldsToKeep || header;
  return rows.map(function(row) {
    var rec = {};
    header.forEach(function(name, i) {
      if (fields.includes(name)) rec[name] = row[i] || '';
    });
    return rec;
  });
}

// Seeded random number generator (mulberry32), so failures are reproducible
function getRandom(seed) {
  return function(n) {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return Math.floor(((t ^ t >>> 14) >>> 0) / 4294967296 * n);
  };
}

// Generate delimited text with quoted values, embedded delimiters and line
// breaks, ragged rows, mixed line breaks, stray quotes and multibyte characters
function randomDelimText(random, delim, chars) {
  var breaks = ['\n', '\r\n', '\r'];
  var colCount = 1 + random(6);
  var header = [];
  for (var i=0; i<colCount; i++) header.push('f' + i);
  var text = header.join(delim);
  var rowCount = random(25);
  for (var r=0; r<rowCount; r++) {
    text += breaks[random(3)];
    var n = random(colCount + 2);
    var values = [];
    for (var j=0; j<n; j++) values.push(randomValue(random, delim, chars));
    text += values.join(delim);
  }
  if (random(2)) text += breaks[random(3)];
  return text;
}

function randomValue(random, delim, charStr) {
  var chars = Array.from(charStr); // whole characters, not UTF-16 code units
  var type = random(10);
  var str = '';
  var len = random(6);
  for (var i=0; i<len; i++) str += chars[random(chars.length)];
  if (type < 2) return '';
  if (type < 4) return '"' + str + delim + '\n' + str.replace(/"/g, '""') + '""' + '"';
  if (type == 4) return str + '"'; // stray quote
  return str.replace(/"/g, '');
}

describe('mapshaper-delim-reader.js', function () {

  describe('readDelimRecordsFromString()', function () {
    var read = readDelimRecordsFromString;
    it('simple test', function () {
      var output = read('a,b,c\n1,2,3', ',', {});
      assert.deepEqual(output, [{a: '1', b: '2', c: '3'}]);
    })

    it('string with BOM', function () {
      var output = read('\ufeffa,b\n1,2', ',', {});
      assert.deepEqual(output, [{a: '1', b: '2'}]);
    })
  })

  describe('readDelimRecords()', function () {
    var read = readDelimRecords;

    it('read several lines', function () {
      var str = 'foo,bar\r\na,b\r\nc,d\r\n';
      var records = read(new StringReader(str), ',');
      assert.deepEqual(records, [{foo:'a', bar:'b'}, {foo: 'c', bar: 'd'}]);
    })

    it('handles newlines in quoted string', function () {
      var str = `name,url,lat,lon
"1942 Grand River Avenue

http://parksandrecdiner.com/

",_hours_in_detroit_273384,42.3346355,-82.98547730000001
foo
`;
      var records = read(new StringReader(str), ',');
      assert.equal(records.length, 2);
      assert.equal(records[0].lon, '-82.98547730000001');
      assert.equal(records[1].name, 'foo');
    })

    it('only header', function () {
      assert.deepEqual(read(new StringReader('a,b,c\n'), ','), []);
      assert.deepEqual(read(new StringReader('a,b,c'), ','), []);
    })

    it('empty input', function () {
      assert.deepEqual(read(new StringReader(''), ','), []);
    })

    it('csv_field_names option', function() {
      var str = 'a,b\n1,2';
      var records = read(new StringReader(str), ',', {csv_field_names: ['foo', 'bar']});
      assert.deepEqual(records, [{foo: 'a', bar: 'b'}, {foo: '1', bar: '2'}])
    });

    it('csv_skip_lines option', function() {
      var str = '\nSome text\n\na,b\n1,2'; // lines of junk
      var records = read(new StringReader(str), ',', {csv_skip_lines: 3});
      assert.deepEqual(records, [{a: '1', b: '2'}])
    });

    it('csv_skip_lines option skips over a quoted line break', function() {
      var str = '"comment\none","comment\ntwo"\na,b\n1,2';
      var records = read(new StringReader(str), ',', {csv_skip_lines: 1});
      assert.deepEqual(records, [{a: '1', b: '2'}])
    });

    it('csv_skip_lines and csv_field_names options', function() {
      // assign new field names by skipping the existing names and assigning names
      var str = 'a,b\n1,2';
      var records = read(new StringReader(str), ',', {csv_field_names: ['foo', 'bar'], csv_skip_lines: 1});
      assert.deepEqual(records, [{foo: '1', bar: '2'}])
    });

    it('csv_fields option', function() {
      var str = '1\t2\t3\n4\t5\t6';
      var opts = {csv_field_names: ['a', 'b', 'c'], csv_fields: ['b']};
      assert.deepEqual(read(new StringReader(str), '\t', opts), [{b: '2'}, {b: '5'}]);
      opts.csv_fields = ['a', 'c'];
      assert.deepEqual(read(new StringReader(str), '\t', opts), [{a: '1', c: '3'}, {a: '4', c: '6'}]);
    });

    it('csv_fields option: quoted line break after the last imported field', function() {
      var str = 'a,b,c\n1,2,"x\ny"\n3,4,z';
      var records = read(new StringReader(str), ',', {csv_fields: ['a']});
      assert.deepEqual(records, [{a: '1'}, {a: '3'}]);
    });

    it('csv_fields option: CR line breaks after the last imported field', function() {
      var str = 'a,b,c\r1,2,x\r3,4,z\r5';
      var records = read(new StringReader(str), ',', {csv_fields: ['a']});
      assert.deepEqual(records, [{a: '1'}, {a: '3'}, {a: '5'}]);
    });

    it('csv_lines option stops reading', function() {
      var str = 'a\n1\n2\n3';
      assert.deepEqual(read(new StringReader(str), ',', {csv_lines: 2}), [{a: '1'}, {a: '2'}]);
    });

    it('parse test 1: missing and extra fields', function () {
      var str = 'foo,bar\r\na,b,c\r\n,\r\n\r\ncd'; // various issues: extra field, missing fields
      var records = read(new StringReader(str), ',');
      assert.deepEqual(records, [{foo: 'a', bar: 'b'}, {foo: '', bar: ''}, {foo: '', bar: ''}, {foo: 'cd', bar: ''}]);
    });

    it('a value that starts with U+FEFF keeps it', function () {
      var str = 'a,b\n\ufeffx,y';
      var records = read(new BufferReader(Buffer.from(str)), ',');
      assert.deepEqual(records, [{a: '\ufeffx', b: 'y'}]);
    });

    it('invalid UTF-8 is decoded with replacement characters', function () {
      var buf = Buffer.concat([Buffer.from('a,b\nx'), Buffer.from([0xe7, 0xf6]), Buffer.from('y,z')]);
      var records = read(new BufferReader(buf), ',');
      assert.deepEqual(records, [{a: 'x\ufffd\ufffdy', b: 'z'}]);
    });

    it('reading from a file, with small chunks', function() {
      var file = 'test/data/text/states.csv';
      var records1 = read(new api.internal.FileReader(file), ',');
      var records2 = read(new api.internal.FileReader(file), ',', {chunk_size: 7});
      // fields: STATE_NAME,STATE_FIPS,SUB_REGION,STATE_ABBR,POP2010,POP10_SQMI
      assert.deepEqual(records2[0], {STATE_NAME: 'Alabama', STATE_FIPS: '01', SUB_REGION: 'East South Central', STATE_ABBR:'AL', POP2010: '4779736', POP10_SQMI: '92.50'});
      assert.equal(records1.length, 52);
      assert.deepEqual(records1, records2);
    });
  })

  describe('readDelimRecords() with encodings', function () {
    var str = 'name|value\r\n国语|"a|b"\r\n𝄞|x\r\n';
    var target = [{name: '国语', value: 'a|b'}, {name: '𝄞', value: 'x'}];

    [1, 3, 64].forEach(function(chunkSize) {
      it('UTF-16LE with BOM, chunk size ' + chunkSize, function () {
        var buf = iconv.encode(str, 'utf16le', {addBOM: true});
        var records = readDelimRecords(new BufferReader(buf), '|', {chunk_size: chunkSize});
        assert.deepEqual(records, target);
      })

      it('UTF-16BE with BOM, chunk size ' + chunkSize, function () {
        var buf = iconv.encode(str, 'utf16be', {addBOM: true});
        var records = readDelimRecords(new BufferReader(buf), '|', {chunk_size: chunkSize});
        assert.deepEqual(records, target);
      })
    });

    it('Big5, where the second byte of a character can be a pipe delimiter', function () {
      // 四 is A5 7C in Big5 (0x7C is "|")
      var buf = iconv.encode('a|b\r\n四|帆', 'big5');
      var records = readDelimRecords(new BufferReader(buf), '|', {encoding: 'big5', chunk_size: 2});
      assert.deepEqual(records, [{a: '四', b: '帆'}]);
    })

    it('latin1', function () {
      var buf = iconv.encode('a,b\n»¼ü©,"è,é"', 'latin1');
      var records = readDelimRecords(new BufferReader(buf), ',', {encoding: 'latin1'});
      assert.deepEqual(records, [{a: '»¼ü©', b: 'è,é'}]);
    })
  })

  describe('readDelimRecords() matches the reference parser on random input', function () {
    var chunkSizes = [1, 2, 3, 5, 8, 13, 64, 1e6];
    var cases = [
      {name: 'UTF-8, comma', delim: ',', encoding: null, chars: 'ab 1.,\t|;"é日𝄞'},
      {name: 'UTF-8, tab', delim: '\t', encoding: null, chars: 'ab 1.,\t"é日'},
      {name: 'UTF-8, pipe', delim: '|', encoding: null, chars: 'ab 1|"é'},
      {name: 'UTF-16LE', delim: ',', encoding: 'utf16le', chars: 'ab 1,"é日𝄞'},
      {name: 'latin1', delim: ';', encoding: 'latin1', chars: 'ab 1;"éü»'}
    ];

    cases.forEach(function(testCase) {
      it(testCase.name, function () {
        var random = getRandom(12345);
        for (var trial=0; trial<150; trial++) {
          var text = randomDelimText(random, testCase.delim, testCase.chars);
          var buf = testCase.encoding ? iconv.encode(text, testCase.encoding) : Buffer.from(text);
          var header = referenceParse(text, testCase.delim)[0];
          var fieldsToKeep = header.filter(function() { return random(2) === 0; });
          if (fieldsToKeep.length === 0) fieldsToKeep = header.slice(0, 1);
          var allFields = referenceRecords(text, testCase.delim);
          var someFields = referenceRecords(text, testCase.delim, fieldsToKeep);
          chunkSizes.forEach(function(chunkSize) {
            var opts = {encoding: testCase.encoding, chunk_size: chunkSize};
            var msg = 'chunk size ' + chunkSize + ', text: ' + JSON.stringify(text);
            assert.deepEqual(readDelimRecords(new BufferReader(buf), testCase.delim, opts), allFields, msg);
            opts.csv_fields = fieldsToKeep;
            assert.deepEqual(readDelimRecords(new BufferReader(buf), testCase.delim, opts), someFields, msg);
          });
        }
      })
    });
  })

  csv_spectrum(function(err, data) {
    describe('readDelimRecords() csv-spectrum tests', function() {
      data.forEach(function(d) {
        it('csv-spectrum ' + d.name, function() {
          var reader = new api.internal.BufferReader(d.csv);
          var records = api.internal.readDelimRecords(reader, ',');
          assert.deepEqual(records, JSON.parse(d.json));
        });

        it('csv-spectrum ' + d.name + ' (1-byte chunks)', function() {
          var reader = new api.internal.BufferReader(d.csv);
          var records = api.internal.readDelimRecords(reader, ',', {chunk_size: 1});
          assert.deepEqual(records, JSON.parse(d.json));
        });
      });
    })
  });

  describe('getDelimFieldFilter()', function () {
    it('selects columns by name', function() {
      var filter = getDelimFieldFilter(['a', 'b', 'c'], ['a', 'c']);
      assert.deepEqual([0, 1, 2].map(filter), [true, false, true]);
    })
  });

  describe('getRowConverter()', function () {
    it('converts arrays to records', function() {
      var convert = getRowConverter(['a', 'b', 'c']);
      assert.deepEqual(convert(['1', '2']), {a: '1', b: '2', c: ''});
    })
  });

  describe('parseDelimText()', function () {
    function test(str, target, delim) {
      delim = delim || ',';
      assert.deepEqual(parseDelimText(str, delim), target);
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

    it('pipe delimiter', function() {
      test('1|2|3\r4|5|6', [['1', '2', '3'], ['4', '5', '6']], '|');
    })
  })

});
