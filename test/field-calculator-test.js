var assert = require('assert'),
    api = require("../"),
    getCalcResults = api.internal.getCalcResults;

describe('mapshaper-field-calculator.js', function () {
  describe('getCalcResults()', function () {
    var data1 = [{foo: -1}, {foo: 3}, {foo: 4}],
        lyr1 = {
          data: new api.internal.DataTable(data1)
        };

    it ('_.sum()', function() {
      var result = getCalcResults(lyr1, null, {expression: '_.sum(foo)'});
      assert.deepEqual(result, {sum: 6});
    })

    it ('_.average()', function() {
      var result = getCalcResults(lyr1, null, {expression: '_.average(foo)'});
      assert.deepEqual(result, {average: 2});
    })

    it ('_.median()', function() {
      var result = getCalcResults(lyr1, null, {expression: '_.median(foo)'});
      assert.deepEqual(result, {median: 3});
    })

    it ('_.min(), _max(), _.count()', function() {
      var result = getCalcResults(lyr1, null, {expression: '_.min(foo), _.max(foo), _.count()'});
      assert.deepEqual(result, {min: -1, max: 4, count: 3});
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
          {expression: '_.average(foo), _.count()', where: 'bar'});
      assert.deepEqual(result, {average: 1, count: 3});
    })
  })

})
