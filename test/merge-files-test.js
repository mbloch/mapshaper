var assert = require('assert'),
    api = require("../"),
    Utils = api.Utils;

describe('mapshaper-merge-files.js', function () {
  describe('extendDataTable()', function () {
    it ('merges two tables', function() {
      var a = new api.data.DataTable([{foo: 'a', bar: 1}]),
          b = new api.data.DataTable([{foo: 'b', bar: 2}])

      assert.deepEqual(api.extendDataTable(a, b).getRecords(),
          [{foo: 'a', bar: 1}, {foo: 'b', bar: 2}])
    })

    it ('handles empty src table', function() {
      var a = new api.data.DataTable([{foo: 'a', bar: 1}]),
          b = new api.data.DataTable()
      assert.deepEqual(api.extendDataTable(a, b).getRecords(),
          [{foo: 'a', bar: 1}])
    })

    it ('handles empty dest table', function() {
      var a = new api.data.DataTable(),
          b = new api.data.DataTable([{foo: 'b', bar: 2}]);
      assert.deepEqual(api.extendDataTable(a, b).getRecords(),
          [{foo: 'b', bar: 2}])
    })
	/*
    it ('throws error on mismatch', function() {
      var a = new api.data.DataTable([{foo: 'a'}]),
          b = new api.data.DataTable([{foo: 'b', bar: 2}])
      assert.throws(function(){ api.extendDataTable(a, b)});
    })
    it ('throws error on mismatch 2', function() {
      var a = new api.data.DataTable([{foo: 'a', bar: 1}]),
          b = new api.data.DataTable([{foo: 'b'}])
      assert.throws(function(){ api.extendDataTable(a, b)});
    })
    */
  })

  describe('mergeArrays()', function () {
    it('merge several arrays', function () {
      var a = [0],
          b = [],
          c = [4.5, -1.5],
          merged = api.mergeArrays([a, b, c], Float64Array);
      assert.deepEqual(Utils.toArray(merged), [0, 4.5, -1.5]);
      assert.equal(merged.length, 3);
    })
  })


})