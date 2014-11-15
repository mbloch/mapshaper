var assert = require('assert'),
    api = require("../");

describe('mapshaper-expressions.js', function () {
  describe('removeExpressionSemicolons()', function () {
    it('removes semicolons at the end of an expression', function () {
      assert.equal(api.internal.removeExpressionSemicolons("NAME = NAME2;"), "NAME = NAME2")
      assert.equal(api.internal.removeExpressionSemicolons("NAME = NAME2; "), "NAME = NAME2")
      assert.equal(api.internal.removeExpressionSemicolons("NAME = NAME2 ;;"), "NAME = NAME2")
    })

    it('converts interior semicolons to commas', function () {
      assert.equal(api.internal.removeExpressionSemicolons("NAME = NAME2; console.log(RANK);"), "NAME = NAME2, console.log(RANK)")
      assert.equal(api.internal.removeExpressionSemicolons("NAME = NAME2; console.log(RANK)"), "NAME = NAME2, console.log(RANK)")
    })

    it('FIX: converts multiple interior semicolons to commas', function () {
      assert.equal(api.internal.removeExpressionSemicolons("NAME = NAME2; DUMMY='x'; console.log(RANK);"),
        "NAME = NAME2, DUMMY='x', console.log(RANK)")
    })
  })

  // Feature expressions are tested in field-calculator-test.js and filter-test.js
  /*
  describe('compileFeatureExpression()', function() {
    describe('data tests', function() {
    })

    describe('polygon tests', function() {
    })
  })
  */

  describe('compileCalcExpression()', function () {
    var nullArcs = new api.internal.ArcCollection([]),
        records = [{foo: 4}, {foo: 0}, {foo: 3.5}, {foo: -0.5}, {foo: 3}];
    var lyr = {
      shapes: new Array(5),
      data: new api.internal.DataTable(records)
    };

    it('sum()', function() {
      var compiled = new api.internal.compileCalcExpression("sum('foo')")
      assert.equal(compiled(lyr, nullArcs), 10);
    })

    it('average()', function() {
      var compiled = new api.internal.compileCalcExpression("average('foo')")
      assert.equal(compiled(lyr, nullArcs), 2);
    })

    it('median()', function() {
      var compiled = new api.internal.compileCalcExpression("median('foo')")
      assert.equal(compiled(lyr, nullArcs), 3);
    })

    it('max()', function() {
      var compiled = new api.internal.compileCalcExpression("max('foo')")
      assert.equal(compiled(lyr, nullArcs), 4);
    })

    it('min()', function() {
      var compiled = new api.internal.compileCalcExpression("min('foo')")
      assert.equal(compiled(lyr, nullArcs), -0.5);
    })

  })

})
