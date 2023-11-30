import api from '../mapshaper.js';
import assert from 'assert';
import iconv from 'iconv-lite';

var Dbf = api.internal.Dbf,
    Node = api.internal.Node,
    Utils = api.utils;

function importRecords(buf, encoding) {
  return api.internal.importDbfTable(buf, {encoding: encoding}).getRecords();
}

describe('dbf-writer.js', function () {

  it('Dbf.MAX_STRING_LEN == 254', function() {
    assert.equal(Dbf.MAX_STRING_LEN, 254);
  })

  describe('convertValueToString()', function () {
    it('null and undefined become empty strings', function () {
      assert.strictEqual(Dbf.convertValueToString(undefined), '');
      assert.strictEqual(Dbf.convertValueToString(null), '');
    })
  })

  describe('convertFieldNames()', function() {
    it ('utf-8 encoding fits three Chinese characters', function() {
      var names = ['一二三四五', '一二三四五六'];
      var names2 = Dbf.convertFieldNames(names, 'utf8');
      assert.deepEqual(names2, ['一二三', '一二三1']); // truncated, deduped
    })
    it ('gbk encoding fits five Chinese characters', function() {
      var names = ['一二三四五', '一二三四五六'];
      var names2 = Dbf.convertFieldNames(names, 'gbk');
      assert.deepEqual(names2, ['一二三四五', '一二三四1']);
    })
  })

  describe('truncateEncodedString()', function () {
    it('truncates problem string to valid utf8', function () {
      // simple truncation creates a partial (invalid) final character
      var enc = 'utf8';
      var src ="Starting from March 28th, a teacher at an auxiliary kindergarten in Yangjiang City went on strike, demanding wage increases.  The teacher in question, Mr. Wu, stated that, after deductions, the net wages received were only around 1,000 yuan per month.  “As inflation creeps upward, an increase from our 1,000 yuan/month wages isn't at all unreasonable,” stated Mr. Wu.";
      var encoded = iconv.encode(src, enc);
      var truncated = encoded.slice(0, Dbf.MAX_STRING_LEN);
      var str = iconv.decode(truncated, enc);
      var truncated2 = Dbf.truncateEncodedString(encoded, enc, Dbf.MAX_STRING_LEN);
      var str2 = iconv.decode(truncated2, enc);
      assert.equal(str.charAt(str.length-1), '\ufffd');
      assert.notEqual(str2.charAt(str2.length-1), '\ufffd');
      assert(truncated2.length < truncated.length);
    })
  })

  describe('field-order=ascending option', function () {
    it ('sorts columns in case-insensitive order', function(done) {
      var a = 'A,Z,B,Y,c,X\na,z,b,y,c,x';
      var cmd = '-i a.csv -o format=dbf field-order=ascending';
      api.applyCommands(cmd, {'a.csv': a}, function(err, output) {
        var dbf = new api.internal.DbfReader(output['a.dbf']);
        assert.deepEqual(dbf.getFields(), 'A,B,c,X,Y,Z'.split(','));
        done();
      });
    });
  })

  describe('Dbf.getFieldInfo()', function () {
    it('integers are identified as type "N"', function () {
      var data = [{a: 2147483648, b: -2147483649, c: 2147483647, d: -2147483648}],
          info;
      info = Dbf.getFieldInfo(data, 'a');
      assert.equal(info.size, 10);
      assert.equal(info.type, 'N');

      info = Dbf.getFieldInfo(data, 'b');
      assert.deepEqual(info.size, 11);

      info = Dbf.getFieldInfo(data, 'c');
      assert.equal(info.size, 10);

      info = Dbf.getFieldInfo(data, 'd');
      assert.deepEqual(info.size, 11);
    })

    it('truncates overflowing strings', function() {
      var data = [{a: Utils.lpad('', 300, 'x')}],
          info = Dbf.getFieldInfo(data, 'a', 'ascii');
      assert.equal(info.type, 'C');
      assert.equal(info.size, 254);
      assert.equal(info.decimals, 0);
      assert(!!info.warning);
    })

    it('minimum text field length is 1', function() {
      var data = [{a: ''}],
          info = Dbf.getFieldInfo(data, 'a', 'ascii');
      assert.equal(info.type, 'C');
      assert.equal(info.size, 1);
      assert.equal(info.decimals, 0);
    })

    it('objects are exported as empty values, with a warning', function() {
      var data = [{a: {}, b: [1], c: function() {}}],
          a = Dbf.getFieldInfo(data, 'a'),
          b = Dbf.getFieldInfo(data, 'b'),
          c = Dbf.getFieldInfo(data, 'c');
      assert(!!a.warning);
      assert(!!b.warning);
      assert(!!c.warning);
      assert.equal(a.size, 0);
      assert.equal(b.size, 0);
      assert.equal(c.size, 0);
    })
  })

  describe('#getNumericFieldInfo()', function () {
    function calc(arr) {
      var records = arr.map(function(n) {return {foo: n}});
      return Dbf.getNumericFieldInfo(records, 'foo');
    }
    it('test1', function () {
      assert.deepEqual(calc([0, -100.22, 0.2]),
        {min: -100.22, max: 0.2, decimals: 2});
    });

    it('test2', function () {
      assert.deepEqual(calc([-0.000001, 100000000.999999]),
        {min: -0.000001, max: 100000000.999999, decimals: 6});
    });

    it('test3', function () {
      assert.deepEqual(calc([-73.9356]),
        {min: -73.9356, max: 0, decimals: 4});
    });

    it('test4', function () {
      assert.deepEqual(calc([Infinity, -Infinity, 2, null, NaN, undefined]),
        {min: 0, max: 2, decimals: 0});
    });

    it('test5', function () {
      assert.deepEqual(calc([]),
        {min: 0, max: 0, decimals: 0});
    });

    it('test6', function () {
      assert.deepEqual(calc([2.324209002348e-6]),
        {min: 0, max: 2.324209002348e-6, decimals: 15});
    });

   it('test7', function () {
      assert.deepEqual(calc([ 100000.00000001]),
        {min: 0, max:100000.00000001, decimals: 8});
    });

   it('test8', function () {
      // this used to fail
      assert.deepEqual(calc([0.0000001, 0.99999, 0.00002, 0.001]),
        {min: 0, max: 0.99999, decimals: 7});
    });

   /*
   // TODO: still some issues with rounding causing more decimals than needed
   it('test9', function () {
      assert.deepEqual(calc([ 1200000.00000001]),
        {min: 0, max:1200000.00000001, decimals: 8});
    });

   it('test10', function () {
      assert.deepEqual(calc([10000000.9999999]),
        {min: 0, max: 10000000.9999999, decimals: 0});
    });
    */
  })

  describe('#discoverFieldType()', function () {
    it('identifies string type', function () {
      var data = [
        {foo: ''},
        {foo: 'bar'}
      ]
      assert.equal(Dbf.discoverFieldType(data, 'foo'), 'C')
    })
    it('all empty strings are string type', function () {
      var data = [
        {foo: ''},
        {foo: ''}
      ]
      assert.equal(Dbf.discoverFieldType(data, 'foo'), 'C')
    })
    it('identifies numeric type', function() {
       var data = [
        {foo: null},
        {foo: NaN},
        {foo: 0}
      ]
      assert.equal(Dbf.discoverFieldType(data, 'foo'), 'N')
    })
    it('identifies Date type', function() {
      var data = [
        {foo: new Date()}
      ];
      assert.equal(Dbf.discoverFieldType(data, 'foo'), 'D')
    })
    it('identifies boolean type', function() {
      var data = [
        {foo: false}
      ];
      assert.equal(Dbf.discoverFieldType(data, 'foo'), 'L')
    })
    it('returns null if no data', function() {
      var records = [{foo: null}];
      assert.strictEqual(Dbf.discoverFieldType(records, 'foo'), null);
      assert.strictEqual(Dbf.discoverFieldType([], 'foo'), null);

    })
  })


  describe('#getDecimalFormatter()', function () {
    it('x.x', function () {
      var fmt = Dbf.getDecimalFormatter(3, 1);
      assert.equal(fmt(0), '0.0')
      assert.equal(fmt(0.151), '0.2')
      assert.equal(fmt(1), '1.0')
    })
    it('xxxxx', function () {
      var fmt = Dbf.getDecimalFormatter(5, 0);
      assert.equal(fmt(0), '    0')
      assert.equal(fmt(0.5), '    1')
      assert.equal(fmt(-100), ' -100')
      assert.equal(fmt(99999), '99999')
    })
    it('xxxx.xxx', function() {
      var fmt = Dbf.getDecimalFormatter(8, 3);
      assert.equal(fmt(0), '   0.000')
      assert.equal(fmt(-123.459), '-123.459')
    })
    it('handle null', function() {
      var fmt = Dbf.getDecimalFormatter(3, 0);
      assert.equal(fmt(null), '   ');
    })
    it('handle NaN', function() {
      var fmt = Dbf.getDecimalFormatter(3, 2);
      assert.equal(fmt(NaN), '   ');
    })
  })

  describe('roundtrip: records -> export -> import -> records', function() {

    it('null records are preserved', function() {
      var records = [{foo: null}];
      var buf = Dbf.exportRecords(records);
      var records2 = importRecords(buf);
      assert.deepEqual(records2, records);
    })

    it('empty strings are preserved', function() {
      var records = [{foo: ""}];
      var buf = Dbf.exportRecords(records);
      var records2 = importRecords(buf);
      assert.deepEqual(records2, records);
    })

    it('10-letter field names are preserved', function() {
      var records = [{abcdefghij: 'foo'}];
      var buf = Dbf.exportRecords(records);
      var records2 = importRecords(buf);
      assert.deepEqual(records2, records);
    })

    it('11-letter field names are truncated', function() {
      var records = [{abcdefghijk: 'foo'}];
      var buf = Dbf.exportRecords(records);
      var records2 = importRecords(buf);
      assert.deepEqual(records2, [{abcdefghij: 'foo'}]);
    })

    it('field name conflicts caused by truncation are resolved', function() {
      var records = [{abcdefghijk: 'foo', abcdefghij: 'bar'}];
      var buf = Dbf.exportRecords(records);
      var records2 = importRecords(buf);
      assert.deepEqual(records2, [{abcdefgh_1: 'foo', abcdefghij: 'bar'}]);
    })

    it('field name conflicts caused by truncation are resolved 2', function() {
      var records = [{abcdefghij: 'bar', abcdefghijk: 'foo'}];
      var buf = Dbf.exportRecords(records);
      var records2 = importRecords(buf);
      assert.deepEqual(records2, [{abcdefgh_1: 'foo', abcdefghij: 'bar'}]);
    })

    it('field name conflicts caused by truncation are resolved 3', function() {
      var records = [{
        abcdefghijk: 'a',
        abcdefghijkl: 'b',
        abcdefghijklm: 'c',
        abcdefgh_2: 'd'
      }];
      var buf = Dbf.exportRecords(records);
      var records2 = importRecords(buf);
      assert.deepEqual(records2, [{
        abcdefghij: 'a',
        abcdefgh_1: 'b',
        abcdefgh_3: 'c',
        abcdefgh_2: 'd'
      }]);
    })

    it('numbers and ascii text', function() {
      var records = [
        {a: -1200, b: 0.3, c: 'Mexico City'},
        {a: 0, b: 0, c: 'Jerusalem'},
        {a: 20000, b: -0.00000000001, c: ''}
      ];

      var buf = Dbf.exportRecords(records);
      var records2 = importRecords(buf);
      assert.deepEqual(records2, records);
    })

    it('dates', function() {
      var records = [
        {a: new Date(Date.UTC(2013, 0, 1))},
        {a: new Date(Date.UTC(1900, 11, 31))}
      ];
      var buf = Dbf.exportRecords(records);
      var records2 = importRecords(buf);
      assert.deepEqual(records2, records);
    })

    it('booleans', function() {
      var records = [
        {a: true},
        {a: false},
        {a: null}
      ];

      var buf = Dbf.exportRecords(records);
      var records2 = importRecords(buf);
      assert.deepEqual(records2, records);
    })

    it('empty table', function() {
      var records = [];
      var records2 = importRecords(Dbf.exportRecords(records));
      assert.deepEqual(records2, records);
    })

    it('ascii w spaces', function() {
      // spaces are trimmed from l & r of strings -- is this what we want?
      // 4/22/2016 other whitespace chars are preserved
      var records = [{a: " moon   "}, {a:"\tstars "}];
      var buf = Dbf.exportRecords(records, 'ascii');
      var records2 = importRecords(buf, 'ascii');
      assert.deepEqual(records2, [{a:"moon"}, {a:"\tstars"}]);
    })

    it('latin1', function() {
      var records = [{a: "Peçeña México"},
          {a:"Neuchâtel Baden-Württemberg La Gruyère"}];
      var buf = Dbf.exportRecords(records, 'latin1');
      var records2 = importRecords(buf, 'latin1');
      // blanks are removed
      assert.deepEqual(records2, records);
    })

    it('gbk', function() {
      var records = [
        {a: "简体国语", b: ""},
        {a: "", b: "foo.;\""}
      ];
      var buf = Dbf.exportRecords(records, 'gbk');
      var records2 = importRecords(buf, 'gbk');
      assert.deepEqual(records2, records);
    })

    it('utf8', function() {
      var records = [
        {a: "简", b: "Peçeña México"},
        {a: "繁體.", b: ""}
      ];
      var buf = Dbf.exportRecords(records, 'utf8');
      var records2 = importRecords(buf, 'utf8');
      assert.deepEqual(records2, records);
    })

    it('shiftjis', function() {
      var records = [
        {a: "うるま市"},
        {a: "常陸那珂"},
        {a: "南アルプス市"},
        {a: "English words and punctuation,;.-'\""}
      ];
      var buf = Dbf.exportRecords(records, 'shiftjis');
      var records2 = importRecords(buf, 'shiftjis');
      assert.deepEqual(records2, records);
    })

  })
})
