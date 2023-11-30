import api from '../mapshaper.js';
import assert from 'assert';

var DataTable = api.internal.DataTable;

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

    it('null input yields null values, zero count', function() {
      var f = api.internal.getJoinCalc(data, 'n = count(), min_area = min(area), fips_mode = mode(fips), tot_area = sum(area)');
      var o = {};
      f(null, o);
      assert.deepStrictEqual(o, {n: 0, min_area: null, fips_mode: null, tot_area: 0});
    })

    it('empty input yields null values, zero count', function() {
      var f = api.internal.getJoinCalc(data,
        'n = count(), max_area = max(area), mean_area=average(area), first_fips = first(fips), last_fips=last(fips)');
      var o = {};
      f([], o);
      assert.deepStrictEqual(o, {n: 0, max_area: null, mean_area: null, first_fips: null, last_fips: null});
    })

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

    it('collect() function', function() {
      var f = api.internal.getJoinCalc(data, 'a = collect(fips), b=collect(area)');
      var a = {}, b = {};
      f([0, 1, 3], a);
      f([], b);
      assert.deepEqual(a, {a: ['41', '41', '51'], b: [500, 300, 450]});
      assert.deepEqual(b, {a: null, b: null});
    })

    it('supports multiple uses', function() {
      var f = api.internal.getJoinCalc(data, 'a = first(fips), b=last(fips), min_area = min(area), fips_mode = mode(fips), med=median(area)');
      var a = {}, b = {}, c = {}, d = {};
      f([1, 2, 3], b);
      f([0], a);
      f([], d);
      f([1, 2, 3], c);
      assert.deepEqual(a, {min_area: 500, fips_mode: '41', a: '41', b: '41', med: 500});
      assert.deepEqual(b, {min_area: 300, fips_mode: '51', a: '41', b: '51', med: 450});
      assert.deepEqual(c, {min_area: 300, fips_mode: '51', a: '41', b: '51', med: 450});
      assert.deepStrictEqual(d, {min_area: null, fips_mode: null, a: null, b: null, med: null});
    })
  })

  });