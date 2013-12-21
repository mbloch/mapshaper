var api = require('../'),
    assert = require('assert'),
    Dbf = api.Dbf,
    Node = api.Node;

describe('dbf-writer.js', function () {

  describe('Dbf#getFieldInfo()', function () {
    it('integers are identified as type "N"', function () {
      var data = [{a: 2147483648, b: -2147483649, c: 2147483647, d: -2147483648}];
      assert.deepEqual(Dbf.getFieldInfo(data, 'a'),
          {name: 'a', type: 'N', size: 10, decimals: 0});
      assert.deepEqual(Dbf.getFieldInfo(data, 'b'),
          {name: 'b', type: 'N', size: 11, decimals: 0});
      assert.deepEqual(Dbf.getFieldInfo(data, 'c'),
          {name: 'c', type: 'N', size: 10, decimals: 0});
      assert.deepEqual(Dbf.getFieldInfo(data, 'd'),
          {name: 'd', type: 'N', size: 11, decimals: 0});
    })

    it('truncates overflowing strings', function() {
      var data = [{a: api.Utils.lpad('', 300, 'x')}];
      assert.deepEqual(Dbf.getFieldInfo(data, 'a'),
          {name: 'a', type: 'C', size: 255, decimals: 0});
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
      assert.equal(Dbf.discoverFieldType(data, 'foo'), 'string')
    })
    it('identifies numeric type', function() {
       var data = [
        {foo: null},
        {foo: NaN},
        {foo: 0}
      ]
      assert.equal(Dbf.discoverFieldType(data, 'foo'), 'number')
    })
  })

  describe('#discoverStringFieldLength()', function () {
    it('finds length of string field', function () {
      var data = [
        {foo: ''},
        {foo: 'bar'}
      ]
      assert.equal(Dbf.discoverStringFieldLength(data, 'foo'), 4)
    })
  })

  describe('#exportRecords()', function () {
    it('should succeed', function () {
      var records = [
        {foo: "abc", bar: -Math.PI, baz: 0},
        {foo: "arbde", bar: 2300, baz: -45}
      ]
      var buf = Dbf.exportRecords(records);
      // Node.writeFile('out.dbf', buf);
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
    it('happy path data', function() {
      var records = [
        {a: -1200, b: 0.3, c: 'Mexico City'},
        {a: 0, b: 0, c: 'Jerusalem'},
        {a: 20000, b: -0.00000000001, c: ''}
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
  })

})
