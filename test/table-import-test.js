var api = require('../'),
    assert = require('assert');

function stringifyEqual(a, b) {
  assert.equal(JSON.stringify(a), JSON.stringify(b));
}

describe('mapshaper-table-import.js', function() {
  describe('stringIsNumeric()', function () {
    it('identifies decimal numbers', function() {
      assert.ok(api.stringIsNumeric('-43.2'))
    })

    it('identifies numbers with spaces', function() {
      assert.ok(api.stringIsNumeric('-2.0  '))
      assert.ok(api.stringIsNumeric('  0'))
    })

    it('identifies scientific notation', function() {
      assert.ok(api.stringIsNumeric('1.3e3'));
    })

    it('reject alphabetic words', function() {
      assert.equal(api.stringIsNumeric('Alphabet'), false)
    })

    it('identifies hex numbers', function() {
      assert.ok(api.stringIsNumeric('0xcc'));
    })

    it('reject empty strings', function() {
      assert.equal(api.stringIsNumeric(''), false)
      assert.equal(api.stringIsNumeric(' '), false)
    })

    it('rejects street addresses', function() {
      assert.equal(api.stringIsNumeric('312 Orchard St'), false);
    })

    it('reject dates', function() {
      assert.equal(api.stringIsNumeric('2013-12-03'), false);
    })

    // TODO: handle hex numbers, comma-separated numbers, European decimals
  })

  describe('guessDelimiter()', function () {
    it('guesses CSV', function () {
      assert.equal(api.guessDelimiter("a,b\n1,2"), ',');
    })

    it("guesses TSV", function() {
      assert.equal(api.guessDelimiter("a\tb\n1,2"), '\t');
    })

    it("guesses pipe delim", function() {
      assert.equal(api.guessDelimiter("a|b\n1,2"), '|');
    })
  })

  describe('parseFieldHeaders', function () {
    it('identify number and string types', function () {
      var index = {};
      var fields = "fips:string,count:number,other".split(',');
      fields = api.parseFieldHeaders(fields, index);
      assert.deepEqual(fields, ['fips', 'count', 'other']);
      assert.deepEqual(index, {fips: 'string', count: 'number'})
    })

    it('accept alternate type names', function () {
      var fields = "fips:s,count:n,other:STR".split(',');
      var index = {};
      fields = api.parseFieldHeaders(fields, index);
      assert.deepEqual(fields, ['fips', 'count', 'other']);
      assert.deepEqual(index, {fips: 'string', count: 'number', other: 'string'})
    })

    it('accept + prefix for numeric types', function () {
      var index = {};
      var fields = "+count,+other".split(',');
      fields = api.parseFieldHeaders(fields, index);
      assert.deepEqual(fields, ['count', 'other']);
      assert.deepEqual(index, {count: 'number', other: 'number'})
    })
  })

  describe('adjustRecordTypes()', function () {
    it('convert numbers by default', function () {
      var records = [{foo:"0", bar:"a", baz: "0xcc", goo: '300 E'}],
          fields = ['foo', 'bar', 'baz', 'goo']
      api.adjustRecordTypes(records, fields);
      stringifyEqual(records, [{foo:0, bar:"a", baz: 0xcc, goo: '300 E'}])
    })

    it('protect string-format numbers with type hints', function() {
      var records = [{foo:"001", bar:"001"}],
          fields = ['foo:string', 'bar'];
      api.adjustRecordTypes(records, fields);
      stringifyEqual(records, [{foo:"001", bar:1}])
    })
  })

  describe('importDelimString()', function () {
    it('test 1', function (done) {
      var str = 'a,b\n"1","2"'
      api.importDelimStringAsync(str, function(table) {
        stringifyEqual(table.getRecords(), [{a: "1", b: "2"}]);
        done();
      });
    })

    it('test 1', function (done) {
      var str = 'a,b\n1,boo'
      api.importDelimStringAsync(str, function(table) {
        stringifyEqual(table.getRecords(), [{a: '1', b: 'boo'}]);
        done();
      });
    })

  })
})
