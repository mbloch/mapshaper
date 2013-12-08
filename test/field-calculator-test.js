var assert = require('assert'),
    api = require("../");

describe('mapshaper-field-calculator.js', function () {
  describe('evaluate()', function () {
    var nullArcs = new api.ArcDataset([]);
    it('create new numeric field', function () {
      var records = [{}, {}];
      var lyr = {
        shapes: [],
        data: new api.data.DataTable(records)
      };
      api.evaluate(lyr, nullArcs, "FOO=0");
      assert.deepEqual(records, [{FOO:0}, {FOO:0}]);
    })

    it('create new string field', function () {
      var records = [{}, {}];
      var lyr = {
        shapes: [],
        data: new api.data.DataTable(records)
      };
      api.evaluate(lyr, nullArcs, "FOO=''");
      assert.deepEqual(records, [{FOO:''}, {FOO:''}]);
    })

    it('delete a field', function () {
      var records = [{foo:'mice'}, {foo:'beans'}];
      var lyr = {
        shapes: [],
        data: new api.data.DataTable(records)
      };
      api.evaluate(lyr, nullArcs, "delete foo");
      assert.deepEqual(records, [{}, {}]);
    })

    it('update a field', function () {
      var records = [{foo:'mice'}, {foo:'beans'}];
      var lyr = {
        shapes: [],
        data: new api.data.DataTable(records)
      };
      api.evaluate(lyr, nullArcs, "foo=foo.substr(0, 2)");
      assert.deepEqual(records, [{foo:'mi'}, {foo:'be'}]);
    })

    it('test $.partCount', function () {
      var records = [{}, {}];
      var lyr = {
        shapes: [[[0, 2], [-2]], null],
        data: new api.data.DataTable(records)
      };
      api.evaluate(lyr, nullArcs, "parts=$.partCount");
      assert.deepEqual(records, [{parts: 2}, {parts: 0}]);
    })

    it('create records if none existed', function () {
      var lyr = {
        shapes: [[[0, 2], [-2]], null]
      };
      api.evaluate(lyr, nullArcs, "parts=$.partCount");
      assert.deepEqual(lyr.data.getRecords(), [{parts: 2}, {parts: 0}]);
    })

    it('rename a field', function () {
      var records = [{foo:'mice'}, {foo:'beans'}];
      var lyr = {
        shapes: [],
        data: new api.data.DataTable(records)
      };
      api.evaluate(lyr, nullArcs, "bar = foo, delete foo");
      assert.deepEqual(records, [{bar: 'mice'}, {bar: 'beans'}]);
    })

    it('use Math.sqrt() to transform a field', function () {
      var records = [{foo:4}, {foo:0}];
      var lyr = {
        shapes: [],
        data: new api.data.DataTable(records)
      };
      api.evaluate(lyr, nullArcs, "bar=Math.sqrt(foo); delete foo");
      assert.deepEqual(records, [{bar: 2}, {bar: 0}]);
    })

  })

})
