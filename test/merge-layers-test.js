var assert = require('assert'),
    api = require("../"),
    internal = api.internal;

describe('mapshaper-merge-layers.js', function () {

  describe('-merge-layers command', function() {
      it('force flag works', function(done) {
        var a = 'id\na';
        var b = 'ID\nb';
        api.applyCommands('a.csv b.csv combine-files -merge-layers target=* force -o c.csv', {'a.csv': a, 'b.csv': b}, function(err, out) {
          var c = out['c.csv'];
          assert.equal(c, 'id,ID\na,\n,b');
          done();
        });

      });
  })

  describe('mergeLayers()', function () {
    it('merging a single layer returns reference to original layer', function() {
      var lyr1 = {
        geometry_type: "point",
        shapes: [[[0, 1]], [[2, 1]]],
        data: new internal.DataTable([{a: 9}, {a: 8}])
      };
      var merged = api.mergeLayers([lyr1]);
      assert.strictEqual(merged[0], lyr1);
    })


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
      assert.deepEqual(merged[0].shapes, [[[0, 1]], [[2, 1]], [[4, 3]]]);
      assert.equal(merged[0].geometry_type, 'point');
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

    it('layers with only geometry are merged', function() {
      var lyr1 = {
        name: 'a',
        geometry_type: "point",
        shapes: [[[0, 1]], [[2, 1]]]
      };
      var lyr2 = {
        name: 'b',
        geometry_type: "point",
        shapes: [[[4, 3]]]
      };
      var merged = api.mergeLayers([lyr1, lyr2]);
      assert.deepEqual(merged[0], {
        name: '',
        geometry_type: 'point',
        shapes: [[[0, 1]], [[2, 1]], [[4, 3]]],
        data: null
      });
    });

    it('layers with only data are merged', function () {
      var lyr1 = {
        data: new internal.DataTable([{a: 9, b: ''}, {b: 'b', a: 8}])
      };
      var lyr2 = {
        data: new internal.DataTable([{a: 7, b: 'w'}])
      };
      var lyr3 = {
        data: new internal.DataTable([{b: 'e', a: 7}])
      };
      var merged = api.mergeLayers([lyr1, lyr2, lyr3]);
      assert.deepEqual(merged[0].data.getRecords(), [{a: 9, b: ''}, {b: 'b', a: 8},
        {a: 7, b: 'w'}, {b: 'e', a: 7}]);
      assert.equal(merged.length, 1);

    })

    it('layers with incompatible data types are not merged', function() {
      var lyr1 = {
        data: new internal.DataTable([{a: 9}, {a: 8}])
      };
      var lyr2 = {
        data: new internal.DataTable([{a: '9'}])
      };
      assert.throws(function() {
        api.mergeLayers([lyr1, lyr2]);
      })
    })

    it('layers with inconsistent fields are not merged', function () {
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

    it('layers with inconsistent fields are merged if force-merging', function () {
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
      var merged = api.mergeLayers([lyr1, lyr2], {force: true})[0].data.getRecords();
      assert.deepEqual(merged, [{a: 9, b: undefined}, {a: 8, b: undefined}, {a: 7, b: 0}]);
      assert.strictEqual(merged[0].b, undefined);
    })

    it('force-merging allows layers with no data to be merged', function () {
      var lyr1 = {
        geometry_type: "point",
        shapes: [[[0, 1]], [[2, 1]]],
        data: null
      };
      var lyr2 = {
        geometry_type: "point",
        shapes: [[[4, 3]]],
        data: new internal.DataTable([{a: 7, b: 0}])
      };
      var merged = api.mergeLayers([lyr1, lyr2], {force: true})[0].data.getRecords();
      assert.deepEqual(merged, [{a: undefined, b: undefined}, {a: undefined, b: undefined}, {a: 7, b: 0}]);
    })
  })

})
