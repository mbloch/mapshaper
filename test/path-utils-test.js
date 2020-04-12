var api = require('../'),
  assert = require('assert');

describe('mapshaper-filename-utils.js', function () {

  describe('getArcPresenceTest2()', function() {
    it('handles point layer without error', function() {
      var arcs = [[[0, 0], [1, 1]], [[1, 1], [2, 2]], [[2, 2], [3, 3]]]; // three arcs
      var layers = [{
        geometry_type: 'polyline',
        shapes: [[[0, ~1]]]
      }, {
        geometry_type: 'point',
        shapes: [[[3, 3]], [[1, 1]]]
      }];
      var test = api.internal.getArcPresenceTest2(layers, new api.internal.ArcCollection(arcs));
      assert.strictEqual(test(0), true);
      assert.strictEqual(test(~0), true);
      assert.strictEqual(test(1), true);
      assert.strictEqual(test(~1), true);
      assert.strictEqual(test(2), false);
      assert.strictEqual(test(~2), false);
      assert.strictEqual(test(3), false);
    })
  })

  describe('parseLocalPath()', function () {
    var path1 = "shapefiles/usa.shp";
    it(path1, function () {
      assert.deepEqual(api.internal.parseLocalPath(path1), {
        extension: "shp",
        pathbase: "shapefiles/usa",
        basename: "usa",
        filename: "usa.shp",
        directory: "shapefiles"
      })
    })

    it("handle wildcard", function () {
      assert.deepEqual(api.internal.parseLocalPath("shapefiles/*.shp"), {
        extension: "shp",
        pathbase: "shapefiles/*",
        basename: "*",
        filename: "*.shp",
        directory: "shapefiles"
      })
    })

    it("handle Windows paths", function () {
      assert.deepEqual(api.internal.parseLocalPath("shapefiles\\*.shp"), {
        extension: "shp",
        pathbase: "shapefiles\\*",
        basename: "*",
        filename: "*.shp",
        directory: "shapefiles"
      })
    })

    var path2 = "usa.shp";
    it(path2, function () {
      assert.deepEqual(api.internal.parseLocalPath(path2), {
        extension: "shp",
        pathbase: "usa",
        basename: "usa",
        filename: "usa.shp",
        directory: ""
      })
    })

    var path3 = "../usa.shp";
    it(path3, function () {
      assert.deepEqual(api.internal.parseLocalPath(path3), {
        extension: "shp",
        pathbase: "../usa",
        basename: "usa",
        filename: "usa.shp",
        directory: ".."
      })
    })

    var path4 = "shapefiles/usa";
    it(path4, function () {
      assert.deepEqual(api.internal.parseLocalPath(path4), {
        extension: "",
        pathbase: "shapefiles/usa",
        basename: "usa",
        filename: "usa",
        directory: "shapefiles"
      })
    })

  })

});
