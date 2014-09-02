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
