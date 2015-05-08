var assert = require('assert'),
    api = require("../"),
    evalCalcExpression = api.internal.evalCalcExpression;

describe('mapshaper-calc.js', function () {
  describe('evalCalcExpression()', function () {
    var data1 = [{foo: -1}, {foo: 3}, {foo: 4}],
        lyr1 = {
          data: new api.internal.DataTable(data1)
        };

    it ('sum()', function() {
      var result = evalCalcExpression(lyr1, null, 'sum(foo)');
      assert.equal(result, 6);
    })

    it ('average()', function() {
      var result = evalCalcExpression(lyr1, null, 'average(foo)');
      assert.equal(result, 2);
    })

    it ('average()', function() {
      var result = evalCalcExpression(lyr1, null, 'average("foo + 2")');
      assert.equal(result, 4);
    })

    it ('median()', function() {
      var result = evalCalcExpression(lyr1, null, 'median(foo)');
      assert.equal(result, 3);
    })

    it ('min()', function() {
      var result = evalCalcExpression(lyr1, null, 'min(foo)');
      assert.equal(result, -1);
    })

    it ('max()', function() {
      var result = evalCalcExpression(lyr1, null, 'max(foo)');
      assert.equal(result, 4);
    })

    it ('count()', function() {
      var result = evalCalcExpression(lyr1, null, 'count()');
      assert.equal(result, 3);
    })

    it ('sum() / count()', function() {
      var result = evalCalcExpression(lyr1, null, 'sum(foo) / count()');
      assert.equal(result, 2);
    })

    it ('calc functions are also members of _ object', function() {
      var data = [{count: 4}, {count: 3}],
          lyr = {
            data: new api.internal.DataTable(data)
          };
      var result = evalCalcExpression(lyr, null, '_.count()');
      assert.equal(result, 2);
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

      var result = api.calc(lyr2, null,
          {expression: 'average(foo)', where: '!!bar'});
      assert.equal(result, 1);
    })
  })

})
