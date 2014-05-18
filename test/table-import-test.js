var api = require('../'),
    utils = api.utils,
    assert = require('assert');

function stringifyEqual(a, b) {
  assert.equal(JSON.stringify(a), JSON.stringify(b));
}

function fixPath(p) {
  return api.internal.Node.path.join(__dirname, p);
}

describe('mapshaper-table-import.js', function() {
  describe('stringIsNumeric()', function () {
    it('identifies decimal numbers', function() {
      assert.ok(utils.stringIsNumeric('-43.2'))
    })

    it('identifies numbers with spaces', function() {
      assert.ok(utils.stringIsNumeric('-2.0  '))
      assert.ok(utils.stringIsNumeric('  0'))
    })

    it('identifies numbers with comma delimiters', function() {
      assert.ok(utils.stringIsNumeric('3,211'))
      assert.ok(utils.stringIsNumeric('-2,000,000.0  '))
    })

    it('identifies scientific notation', function() {
      assert.ok(utils.stringIsNumeric('1.3e3'));
    })

    it('reject alphabetic words', function() {
      assert.equal(utils.stringIsNumeric('Alphabet'), false)
    })

    it('identifies hex numbers', function() {
      assert.ok(utils.stringIsNumeric('0xcc'));
    })

    it('reject empty strings', function() {
      assert.equal(utils.stringIsNumeric(''), false)
      assert.equal(utils.stringIsNumeric(' '), false)
    })

    it('rejects street addresses', function() {
      assert.equal(utils.stringIsNumeric('312 Orchard St'), false);
    })

    it('reject dates', function() {
      assert.equal(utils.stringIsNumeric('2013-12-03'), false);
    })

    // TODO: handle hex numbers, comma-separated numbers, European decimals
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
  })

  describe('parseFieldHeaders', function () {
    it('identify number and string types', function () {
      var index = {};
      var fields = "fips:string,count:number,other".split(',');
      fields = api.internal.parseFieldHeaders(fields, index);
      assert.deepEqual(fields, ['fips', 'count', 'other']);
      assert.deepEqual(index, {fips: 'string', count: 'number'})
    })

    it('accept alternate type names', function () {
      var fields = "fips:s,count:n,other:STR".split(',');
      var index = {};
      fields = api.internal.parseFieldHeaders(fields, index);
      assert.deepEqual(fields, ['fips', 'count', 'other']);
      assert.deepEqual(index, {fips: 'string', count: 'number', other: 'string'})
    })

    it('accept + prefix for numeric types', function () {
      var index = {};
      var fields = "+count,+other".split(',');
      fields = api.internal.parseFieldHeaders(fields, index);
      assert.deepEqual(fields, ['count', 'other']);
      assert.deepEqual(index, {count: 'number', other: 'number'})
    })

    it('accept inconsistent type hints', function () {
      var fields = "fips,count,fips:str".split(',');
      var index = {};
      fields = api.internal.parseFieldHeaders(fields, index);
      assert.deepEqual(fields, ['fips', 'count', 'fips']);
      assert.deepEqual(index, {fips: 'string'})
    })

    it('accept inconsistent type hints 2', function () {
      var fields = "fips:str,count,fips".split(',');
      var index = {};
      fields = api.internal.parseFieldHeaders(fields, index);
      assert.deepEqual(fields, ['fips', 'count', 'fips']);
      assert.deepEqual(index, {fips: 'string'})
    })

  })

  describe('importJoinTableAsync', function () {
    it('import csv w/ typed key', function (done) {
      var opts = {
        keys: ['KEY1', 'FIPS:str'],
        fields: null
      }
      api.importJoinTableAsync(fixPath("test_data/two_states.csv"), opts,
          function(table) {
            var records = table.getRecords(),
                fields = table.getFields();
            fields.sort();
            assert.deepEqual(fields, ['FIPS', 'LAT', 'LONG', 'STATE', 'STATE_NAME'])
            assert.deepEqual(records[0], {
              STATE_NAME: 'Oregon',
              FIPS: '41',
              STATE: 'OR',
              LAT: 43.94,
              LONG: -120.55
            })
            // make sure FIPS is a string
            // deepEqual() doesn't use strict equality
            assert.ok(utils.isString(records[0].FIPS))
            assert.ok(utils.isNumber(records[0].LAT))
            done();
          })
    })

  })

  describe('adjustRecordTypes()', function () {
    it('convert numbers by default', function () {
      var records = [{foo:"0", bar:"4,000,300", baz: "0xcc", goo: '300 E'}],
          fields = ['foo', 'bar', 'baz', 'goo']
      api.internal.adjustRecordTypes(records, fields);
      stringifyEqual(records, [{foo:0, bar:4000300, baz: 0xcc, goo: '300 E'}])
    })

    it('protect string-format numbers with type hints', function() {
      var records = [{foo:"001", bar:"001"}],
          fields = ['foo:string', 'bar'];
      api.internal.adjustRecordTypes(records, fields);
      stringifyEqual(records, [{foo:"001", bar:1}])
    })

    it('bugfix 1: handle numeric data (e.g. from dbf)', function() {
      var records = [{a: 0, b: 23.2, c: -12}],
          fields = ['a', 'b:number', 'c'];
      api.internal.adjustRecordTypes(records, fields);
      stringifyEqual(records, [{a: 0, b: 23.2, c: -12}])
    })

  })

  describe('importDelimString()', function () {
    it('test 1', function (done) {
      var str = 'a,b\n"1","2"'
      api.internal.importDelimStringAsync(str, function(table) {
        stringifyEqual(table.getRecords(), [{a: "1", b: "2"}]);
        done();
      });
    })

    it('test 1', function (done) {
      var str = 'a,b\n1,boo'
      api.internal.importDelimStringAsync(str, function(table) {
        stringifyEqual(table.getRecords(), [{a: '1', b: 'boo'}]);
        done();
      });
    })

  })
})
