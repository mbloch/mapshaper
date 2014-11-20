var api = require('../'),
  assert = require('assert');


function fixPath(p) {
  return require('path').join(__dirname, p);
}

describe('mapshaper-common.js', function () {

  describe('guessFileFormat()', function () {
    it('.json -> geojson', function () {
      assert.equal(api.internal.guessFileFormat("file.json"), "geojson");
    })

    it('.json + topojson -> topojson', function () {
      assert.equal(api.internal.guessFileFormat("file.json", "topojson"), "topojson");
    })

    it('.topojson -> topojson', function () {
      assert.equal(api.internal.guessFileFormat("file.topojson"), "topojson");
    })

    it('.shp -> shapefile', function () {
      assert.equal(api.internal.guessFileFormat("file.shp"), "shapefile");
    })

    it('.txt -> null', function () {
      assert.equal(api.internal.guessFileFormat("file.txt"), null);
    })

    it('.dbf -> null', function () {
      assert.equal(api.internal.guessFileFormat("file.dbf"), null);
    })
  })

  describe('wildcardToRxp()', function () {
    var ex1 = "layer1"
    it(ex1, function () {
      assert.equal(api.utils.wildcardToRegExp(ex1).source, 'layer1');
    })

    var ex2 = "layer*";
    it(ex2, function() {
      assert.equal(api.utils.wildcardToRegExp(ex2).source, 'layer.*');
    })
  })

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

})
