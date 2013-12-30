var api = require('../'),
    assert = require('assert'),
    Dbf = api.Dbf,
    Node = api.Node;

describe('dbf-writer.js', function () {

  describe('Dbf#getFieldInfo()', function () {
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
      var data = [{a: api.Utils.lpad('', 300, 'x')}],
          info = Dbf.getFieldInfo(data, 'a', 'ascii');
      assert.equal(info.type, 'C');
      assert.equal(info.size, 254);
      assert.equal(info.decimals, 0);
      assert.equal(info.name, 'a');
    })
  })

  describe('#getNumericFieldInfo()', function () {
    it('test1', function () {
      var data = [{foo: 0}, {foo: -100.22}, {foo: 0.2}];
      assert.deepEqual(Dbf.getNumericFieldInfo(data, 'foo'),
        {min: -100.22, max: 0.2, decimals: 2});
    })
  })

  describe('#discoverFieldType()', function () {
    it('identifies string type', function () {
      var data = [
        {foo: ''},
        {foo: 'bar'}
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
    it('numbers and ascii text', function() {
      var records = [
        {a: -1200, b: 0.3, c: 'Mexico City'},
        {a: 0, b: 0, c: 'Jerusalem'},
        {a: 20000, b: -0.00000000001, c: ''}
      ];

      var buf = Dbf.exportRecords(records);
      var records2 = Dbf.importRecords(buf);
      assert.deepEqual(records2, records);
    })

    it('dates', function() {
      var records = [
        {a: new Date(Date.UTC(2013, 0, 1))},
        {a: new Date(Date.UTC(1900, 11, 31))}
      ];
      var buf = Dbf.exportRecords(records);
      var records2 = Dbf.importRecords(buf);
      assert.deepEqual(records2, records);
    })

    it('booleans', function() {
      var records = [
        {a: true},
        {a: false},
        {a: null}
      ];

      var buf = Dbf.exportRecords(records);
      var records2 = Dbf.importRecords(buf);
      assert.deepEqual(records2, records);
    })

    it('empty table', function() {
      var records = [];
      var records2 = Dbf.importRecords(Dbf.exportRecords(records));
      assert.deepEqual(records2, records);
    })

    it('ascii w spaces', function() {
      // whitespace is stripped from l and r -- is this what we want?
      var records = [{a: " moon\n"},
          {a:" \tstars "}];
      var buf = Dbf.exportRecords(records, 'ascii');
      var records2 = Dbf.importRecords(buf, 'ascii');
      assert.deepEqual(records2, [{a:"moon"}, {a:"stars"}]);
    })

    it('latin1', function() {
      var records = [{a: "Peçeña México"},
          {a:"Neuchâtel Baden-Württemberg La Gruyère"}];
      var buf = Dbf.exportRecords(records, 'latin1');
      var records2 = Dbf.importRecords(buf, 'latin1');
      // blanks are removed
      assert.deepEqual(records2, records);
    })

    it('gbk', function() {
      var records = [
        {a: "简体国语", b: ""},
        {a: "", b: "foo.;\""}
      ];
      var buf = Dbf.exportRecords(records, 'gbk');
      var records2 = Dbf.importRecords(buf, 'gbk');
      assert.deepEqual(records2, records);
    })

    it('utf8', function() {
      var records = [
        {a: "简", b: "Peçeña México"},
        {a: "繁體.", b: ""}
      ];
      var buf = Dbf.exportRecords(records, 'utf8');
      var records2 = Dbf.importRecords(buf, 'utf8');
      assert.deepEqual(records2, records);
    })
  })
})
