var assert = require('assert'),
    api = require("../"),
    Utils = api.Utils;

describe('mapshaper-merge-files.js', function () {
  describe('getCommonFilePrefix()', function () {
    it('find common filename stem', function () {
      var files = ['states-DC.shp', 'states-MD.shp', 'states-NY.shp']
      assert.equal(api.getCommonFilePrefix(files), 'states-');
    })
    it('returns filename w/o extension of single file', function () {
      var files = ['states-DC.shp']
      assert.equal(api.getCommonFilePrefix(files), 'states-DC');
    })
    it('returns empty string if nothing in common', function () {
      var files = ['states-DC.shp', 'lakes.shp']
      assert.equal(api.getCommonFilePrefix(files), '');
    })
  })

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
  });

  describe('getLayerNames()', function () {
    it('dissimilar names', function () {
      var names = api.getLayerNames(["innerlines.shp", "../states.shp"]);
      assert.deepEqual(names, ['innerlines', 'states']);
    })

    it('common prefix', function() {
      var names = api.getLayerNames(["OR-streets.json", "OR-hwys.json"]);
      assert.deepEqual(names, ['streets', 'hwys']);
    })

    it('one name is substring of other', function() {
      var names = api.getLayerNames(["OR.json", "OR-hwys.json"]);
      assert.deepEqual(names, ['OR', 'OR-hwys']);
    })

    it('duplicate filenames', function() {
      var names = api.getLayerNames(["OR.json", "../OR.json"]);
      assert.deepEqual(names, ['OR1', 'OR2']);
    })
  })

})