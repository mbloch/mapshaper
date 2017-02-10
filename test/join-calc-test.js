var api = require('../'),
    assert = require('assert'),
    DataTable = api.internal.DataTable,
    deepStrictEqual = require('deep-eql');

describe('mapshaper-join-calc.js', function() {

  describe('getJoinCalc()', function() {
    var records = [
      {fips: '41', area: 500},
      {fips: '41', area: 300},
      {fips: '51', area: 500},
      {fips: '51', area: 450},
      {fips: '51', area: 150}
    ];
    var copy = JSON.parse(JSON.stringify(records));
    var data = new DataTable(records);

    it('source records are not modified', function() {
      var f = api.internal.getJoinCalc(data, 'min_area = min(area), fips_mode = mode(fips)');
      f([0, 2, 3, 4], {});
      assert.deepEqual(records, copy);
    })

    it('function names are hidden by variable names in destination table', function() {
      var f = api.internal.getJoinCalc(data, 'count = _.count(), max = _.max(area)');
      var o = {};
      f([1, 2, 3, 4], o);
      assert.deepEqual(o, {count: 4, max: 500});
      assert.deepEqual(records, copy);
    })

    it('function names are hidden by variable names in source table', function() {
      var records = [{count: 3}, {count: 5}];
      var data = new DataTable(records);
      var f = api.internal.getJoinCalc(data, 'sum = _.sum(count), records=_.count()');
      var o = {};
      f([0, 1], o);
      assert.deepEqual(o, {sum: 8, records: 2});
      assert.deepEqual(records, [{count: 3}, {count: 5}]);
    })

    it('supports multiple uses', function() {
      var f = api.internal.getJoinCalc(data, 'min_area = min(area), fips_mode = mode(fips)');
      var a = {}, b = {};
      f([0], a);
      f([1, 2, 3], b);
      assert.deepEqual(a, {min_area: 500, fips_mode: '41'});
      assert.deepEqual(b, {min_area: 300, fips_mode: '51'});
    })

    it('null input yields null values', function() {
      var f = api.internal.getJoinCalc(data, 'min_area = min(area), fips_mode = mode(fips)');
      var o = {};
      f(null, o);
      assert(deepStrictEqual(o, {min_area: null, fips_mode: null}));
    })

    it('empty input yields null values', function() {
      var f = api.internal.getJoinCalc(data, 'min_area = min(area), fips_mode = mode(fips)');
      var o = {};
      f([], o);
      assert(deepStrictEqual(o, {min_area: null, fips_mode: null}));
    })

  })

  });