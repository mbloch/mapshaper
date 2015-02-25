var api = require('../'),
  assert = require('assert');

describe('mapshaper-path-utils.js', function () {

  describe('parseLocalPath()', function () {
    var path1 = "shapefiles/usa.shp";
    it(path1, function () {
      assert.deepEqual(api.utils.parseLocalPath(path1), {
        extension: "shp",
        pathbase: "shapefiles/usa",
        basename: "usa",
        filename: "usa.shp",
        directory: "shapefiles"
      })
    })

    it("handle wildcard", function () {
      assert.deepEqual(api.utils.parseLocalPath("shapefiles/*.shp"), {
        extension: "shp",
        pathbase: "shapefiles/*",
        basename: "*",
        filename: "*.shp",
        directory: "shapefiles"
      })
    })

    it("handle Windows paths", function () {
      assert.deepEqual(api.utils.parseLocalPath("shapefiles\\*.shp"), {
        extension: "shp",
        pathbase: "shapefiles\\*",
        basename: "*",
        filename: "*.shp",
        directory: "shapefiles"
      })
    })

    var path2 = "usa.shp";
    it(path2, function () {
      assert.deepEqual(api.utils.parseLocalPath(path2), {
        extension: "shp",
        pathbase: "usa",
        basename: "usa",
        filename: "usa.shp",
        directory: ""
      })
    })

    var path3 = "../usa.shp";
    it(path3, function () {
      assert.deepEqual(api.utils.parseLocalPath(path3), {
        extension: "shp",
        pathbase: "../usa",
        basename: "usa",
        filename: "usa.shp",
        directory: ".."
      })
    })

    var path4 = "shapefiles/usa";
    it(path4, function () {
      assert.deepEqual(api.utils.parseLocalPath(path4), {
        extension: "",
        pathbase: "shapefiles/usa",
        basename: "usa",
        filename: "usa",
        directory: "shapefiles"
      })
    })

  })

});
