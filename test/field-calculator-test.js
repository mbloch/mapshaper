var assert = require('assert'),
    api = require("../"),
    getCalcResults = api.internal.getCalcResults;

describe('mapshaper-field-calculator.js', function () {
  describe('getCalcResults()', function () {
    var data1 = [{foo: -1}, {foo: 3}, {foo: 4}],
        lyr1 = {
          data: new api.internal.DataTable(data1)
        };

    it ('sum()', function() {
      var result = getCalcResults(lyr1, null, {expression: 'sum(foo)'});
      assert.deepEqual(result, {sum: 6});
    })

    it ('average()', function() {
      var result = getCalcResults(lyr1, null, {expression: 'average(foo)'});
      assert.deepEqual(result, {average: 2});
    })

    it ('median()', function() {
      var result = getCalcResults(lyr1, null, {expression: 'median(foo)'});
      assert.deepEqual(result, {median: 3});
    })

    it ('min(), _max(), count()', function() {
      var result = getCalcResults(lyr1, null, {expression: 'min(foo), max(foo), count()'});
      assert.deepEqual(result, {min: -1, max: 4, count: 3});
    })

    it ('calc functions also members of _ object', function() {
      var data = [{count: 4}, {count: 3}],
          lyr = {
            data: new api.internal.DataTable(data)
          };
      var result = getCalcResults(lyr, null, {expression: '_.count(), _.sum(count)'});
      assert.deepEqual(result, {count: 2, sum: 7});
    })

    it ('where= expression excludes a record', function() {

      var data2 = [
          {foo: -1, bar: true},
          {foo: 3, bar: false},
          {foo: 4, bar: true},
          {foo: 0, bar: true}];
      var lyr2 = {
            data: new api.internal.DataTable(data2)
          };

      var result = getCalcResults(lyr2, null,
          {expression: 'average(foo), count()', where: 'bar'});
      assert.deepEqual(result, {average: 1, count: 3});
    })
  })

})
