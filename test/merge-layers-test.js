var assert = require('assert'),
    api = require("../"),
    internal = api.internal;

describe('mapshaper-merge-layers.js', function () {

  describe('mergeLayers()', function () {
    it('compatible layers are merged', function () {
      var lyr1 = {
        geometry_type: "point",
        shapes: [[[0, 1]], [[2, 1]]],
        data: new internal.DataTable([{a: 9}, {a: 8}])
      };
      var lyr2 = {
        geometry_type: "point",
        shapes: [[[4, 3]]],
        data: new internal.DataTable([{a: 7}])
      };
      var merged = api.mergeLayers([lyr1, lyr2]);
      assert.deepEqual(merged[0].data.getRecords(), [{a: 9}, {a: 8}, {a: 7}]);
    })

    it('layers with incompatible geometries are not merged', function () {
      var lyr1 = {
        geometry_type: "point",
        shapes: [[[0, 1]], [[2, 1]]],
        data: new internal.DataTable([{a: 9}, {a: 8}])
      };
      var lyr2 = {
        data: new internal.DataTable([{a: 7}])
      };
      assert.throws(function() {
        var merged = api.mergeLayers([lyr1, lyr2]);
      })
    })

    it('layers with incompatible data are not merged', function () {
      var lyr1 = {
        geometry_type: "point",
        shapes: [[[0, 1]], [[2, 1]]],
        data: new internal.DataTable([{a: 9}, {a: 8}])
      };
      var lyr2 = {
        geometry_type: "point",
        shapes: [[[4, 3]]],
        data: new internal.DataTable([{a: 7, b: 0}])
      };
      assert.throws(function() {
        var merged = api.mergeLayers([lyr1, lyr2]);
      })
    })

  })

})