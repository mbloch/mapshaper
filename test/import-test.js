var api = require('../'),
    assert = require('assert');

//      b --- d
//     / \   /
//    /   \ /
//   a --- c

// cabc, dcbd
var geo1 = {
  type: "GeometryCollection",
  geometries: [
    {
      type: "Polygon",
      coordinates: [[[3, 1], [1, 1], [2, 3], [3, 1]]]
    }, {
      type: "Polygon",
      coordinates: [[[4, 3], [3, 1], [2, 3], [4, 3]]]
    }
  ]
};

// feature collection with one null-geometry feature
var geo2 = {
  type: "FeatureCollection",
  features: [
    {
      geometry: {
        type: "Polygon",
        coordinates: [[[3, 1], [1, 1], [2, 3], [3, 1]]]
      }, properties: {FID: 0}
    }, {
      geometry: null,
      properties: {FID: 1}
    }, {
      geometry: {
        type: "Polygon",
        coordinates: [[[4, 3], [3, 1], [2, 3], [4, 3]]]
      }, properties: {FID: 2}
    }
  ]
};

describe('mapshaper-import.js', function () {
  describe('import geojson w/out topology', function () {
    it("two triangles as GeometryCollection", function() {
      var geojson = JSON.stringify(geo1);
      var data = api.internal.importFileContent(geojson, 'json', {no_topology: true});
      var target = [[[3, 1], [1, 1], [2, 3], [3, 1]], [[4, 3], [3, 1], [2, 3], [4, 3]]];
      assert.deepEqual(target, data.arcs.toArray());
    })

    it("two triangles as FeatureCollection with one null-geometry feature", function() {
      var geojson = JSON.stringify(geo2);
      var data = api.internal.importFileContent(geojson, 'json', {no_topology: true});
      var target = [[[3, 1], [1, 1], [2, 3], [3, 1]], [[4, 3], [3, 1], [2, 3], [4, 3]]];
      assert.deepEqual(target, data.arcs.toArray());
      assert.deepEqual([[[0]], null, [[1]]], data.layers[0].shapes);
      assert.deepEqual([{FID: 0}, {FID: 1}, {FID: 2}], data.layers[0].data.getRecords());
    })
  })

  describe('import geojson with topology', function () {
    it("two triangles as GeometryCollection", function() {
      var geojson = JSON.stringify(geo2);
      var data = api.internal.importFileContent(geojson, 'json', {});
      // cab, bc, bdc
      var target = [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]], [[2, 3], [4, 3], [3, 1]]];
      assert.deepEqual(target, data.arcs.toArray());
    })
  })

})
