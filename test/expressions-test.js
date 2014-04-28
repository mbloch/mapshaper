var assert = require('assert'),
    api = require("../");


describe('mapshaper-expressions.js', function () {
  describe('removeExpressionSemicolons()', function () {
    it('removes semicolons at the end of an expression', function () {
      assert.equal(api.removeExpressionSemicolons("NAME = NAME2;"), "NAME = NAME2")
      assert.equal(api.removeExpressionSemicolons("NAME = NAME2; "), "NAME = NAME2")
      assert.equal(api.removeExpressionSemicolons("NAME = NAME2 ;;"), "NAME = NAME2")
    })

    it('converts interior semicolons to commas', function () {
      assert.equal(api.removeExpressionSemicolons("NAME = NAME2; console.log(RANK);"), "NAME = NAME2, console.log(RANK)")
      assert.equal(api.removeExpressionSemicolons("NAME = NAME2; console.log(RANK)"), "NAME = NAME2, console.log(RANK)")
    })

    it('FIX: converts multiple interior semicolons to commas', function () {
      assert.equal(api.removeExpressionSemicolons("NAME = NAME2; DUMMY='x'; console.log(RANK);"),
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


  describe('compileLayerExpression()', function () {
    var nullArcs = new api.internal.ArcDataset([]),
        records = [{foo: 4}, {foo: 0}, {foo: 3.5}, {foo: -0.5}, {foo: 3}];
    var lyr = {
      shapes: new Array(5),
      data: new api.internal.DataTable(records)
    };

    it('sum()', function() {
      var compiled = new api.compileLayerExpression("sum('foo')", nullArcs)
      assert.equal(compiled(lyr), 10);
    })

    it('average()', function() {
      var compiled = new api.compileLayerExpression("average('foo')", nullArcs)
      assert.equal(compiled(lyr), 2);
    })

    it('median()', function() {
      var compiled = new api.compileLayerExpression("median('foo')", nullArcs)
      assert.equal(compiled(lyr), 3);
    })

    it('max()', function() {
      var compiled = new api.compileLayerExpression("max('foo')", nullArcs)
      assert.equal(compiled(lyr), 4);
    })

    it('min()', function() {
      var compiled = new api.compileLayerExpression("min('foo')", nullArcs)
      assert.equal(compiled(lyr), -0.5);
    })

  })

})
