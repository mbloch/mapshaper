
var api = require('../'),
  assert = require('assert'),
  TopoJSON = api.internal.topojson,
  ArcCollection = api.internal.ArcCollection,
  Utils = api.utils;


describe('topojson-import.js', function () {

  describe('importTopoJSON()', function () {
    it('mixed geom types are split into layers', function () {
      var topology = {
        type: "Topology",
        arcs: [[[3, 4], [4, 3], [3, 2], [2, 3], [3, 4]],
          [[3, 5], [5, 3], [3, 1], [1, 3],[3, 5]]],
        objects: {
          features: {
            type: "GeometryCollection",
            geometries: [{
              type: "MultiPolygon",
              arcs: [[[0]], [[1], [~0]]]
            }, {
              type: "Point",
              coordinates: [0, 0]
            }]
          }
        }
      };

      var dataset = api.internal.importTopoJSON(topology, {});
      assert.deepEqual(dataset.layers, [{
        name: 'features',
        geometry_type: 'polygon',
        shapes: [[[0], [1], [~0]]],
        data: null
      }, {
        name: 'features',
        geometry_type: 'point',
        shapes: [[[0, 0]]],
        data: null
      }])

    })
  })

  describe('importObject()', function () {
    it('GeometryCollection with all null geometries is imported without shapes', function() {
      var obj = {
        type: 'GeometryCollection',
        geometries: [{
          type: null,
          properties: {foo: 'a'}
        }]
      }
      var lyr = TopoJSON.importObject(obj)[0];
      assert.equal(lyr.geometry_type, undefined);
      assert.equal(lyr.shapes, undefined);
      assert.deepEqual(lyr.data.getRecords(), [{foo: 'a'}]);
    })

    it('importObject() with id_field', function () {
      var obj = {
        type: "Point",
        id: 'bar',
        coordinates: [3, 2]
      };
      var lyr = TopoJSON.importObject(obj, {id_field: 'foo'})[0];
      var records = lyr.data.getRecords();
      assert.deepEqual(records, [{foo: 'bar'}]);
    })
  })


});