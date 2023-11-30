import api from '../mapshaper.js';
import assert from 'assert';
var internal = api.internal;


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

  describe('getPathBase()', function () {
    it('test1', function () {
      var base = internal.getPathBase('out/file.json')
      assert.equal(base, 'out/file');
    })

    it('test2', function () {
      var base = internal.getPathBase('file.json')
      assert.equal(base, 'file');
    })

    it('test3', function() {
      assert.equal(internal.getPathBase('file.json.gz'), 'file.json');
    })
  })

  describe('replaceFileExtension()', function () {
    it('test1', function () {
      var base = internal.replaceFileExtension('out/file.json', 'geojson')
      assert.equal(base, 'out/file.geojson');
    })

    it('test2', function () {
      var base = internal.replaceFileExtension('file.json', 'txt')
      assert.equal(base, 'file.txt');
    })

    it('test3', function() {
      assert.equal(internal.replaceFileExtension('out/file.json.gz', ''), 'out/file.json')
    })
  })

  describe('parseLocalPath()', function () {
    var path1 = "shapefiles/usa.shp";
    it(path1, function () {
      assert.deepEqual(api.internal.parseLocalPath(path1), {
        extension: "shp",
        basename: "usa",
        filename: "usa.shp",
        directory: "shapefiles"
      })
    })

    it("handle wildcard + extension", function () {
      assert.deepEqual(api.internal.parseLocalPath("shapefiles/*.shp"), {
        extension: "shp",
        basename: "*",
        filename: "*.shp",
        directory: "shapefiles"
      })
    })

    it("handle wildcard w/o extension", function () {
      assert.deepEqual(api.internal.parseLocalPath("shapefiles/*"), {
        extension: "",
        basename: "*",
        filename: "*",
        directory: "shapefiles"
      })
    })

    it("handle Windows paths", function () {
      assert.deepEqual(api.internal.parseLocalPath("shapefiles\\*.shp"), {
        extension: "shp",
        basename: "*",
        filename: "*.shp",
        directory: "shapefiles"
      })
    })

    var path2 = "usa.shp";
    it(path2, function () {
      assert.deepEqual(api.internal.parseLocalPath(path2), {
        extension: "shp",
        basename: "usa",
        filename: "usa.shp",
        directory: ""
      })
    })

    var path3 = "../usa.shp";
    it(path3, function () {
      assert.deepEqual(api.internal.parseLocalPath(path3), {
        extension: "shp",
        basename: "usa",
        filename: "usa.shp",
        directory: ".."
      })
    })

    var path4 = "shapefiles/usa";
    it(path4, function () {
      assert.deepEqual(api.internal.parseLocalPath(path4), {
        extension: "",
        basename: "",
        filename: "",
        directory: "shapefiles/usa"
      })
    })

    var path5 = "shapefiles/usa.json/";
    it(path5, function () {
      assert.deepEqual(api.internal.parseLocalPath(path5), {
        extension: "",
        basename: "",
        filename: "",
        directory: "shapefiles/usa.json"
      })
    })

    var path6 = "shapefiles/04.02";
    it(path6, function () {
      assert.deepEqual(api.internal.parseLocalPath(path6), {
        extension: "",
        basename: "",
        filename: "",
        directory: "shapefiles/04.02"
      })
    })

  })

});
