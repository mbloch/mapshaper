
import api from '../mapshaper.js';
import assert from 'assert';

var TopoJSON = api.internal.topojson,
  ArcCollection = api.internal.ArcCollection,
  Utils = api.utils;

describe('topojson-import.js', function () {

  describe('importTopoJSON()', function () {

    it('accepts nested GeometryCollection objects of one type', function() {
      var topology = {
        arcs: [],
        objects: {
          points: {
            type: "GeometryCollection",
            geometries: [{
              type: "GeometryCollection",
              properties: {type: "A"},
              geometries: [{
                type: "Point",
                properties: {type: "B"}, // ignored
                coordinates: [1, 2]
              }]
            }]
          }
        }
      };
      var dataset = api.internal.importTopoJSON(topology, {});
      assert.deepEqual(JSON.parse(JSON.stringify(dataset.layers[0])), {
        name: 'points',
        geometry_type: 'point',
        shapes: [[[1, 2]]],
        data: [{type: 'A'}]
      });
    })

    it('winding order of polygon rings is updated to CW/CCW', function() {
      var topology = {
        arcs: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
          [[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]]],
        objects: {
          layer1: {
            type: "Polygon",
            arcs: [[0], [1]]
          }
        }
      };
      var dataset = api.internal.importTopoJSON(topology, {});
      assert.deepEqual(dataset.layers[0], {
        name: 'layer1',
        data: null,
        geometry_type: 'polygon',
        shapes: [[[~0], [~1]]]
      });
    })

    it('zero-area polygon rings are dropped', function() {
      var topology = {
        arcs: [[[0, 0], [4, 0], [4, 4]],
          [[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]]],
        objects: {
          layer1: {
            type: "Polygon",
            arcs: [[0, ~0], [1]]
          }
        }
      };
      var dataset = api.internal.importTopoJSON(topology, {});
      // TODO: consider not assigning a geometry type if there are no shapes
      assert.deepEqual(dataset.layers[0], {
        name: 'layer1',
        data: null,
        shapes: [null],
        geometry_type: 'polygon'
      });
    })

    it('zero-area polygon holes are dropped', function() {
      var topology = {
        arcs: [[[0, 0], [0, 4], [4, 4], [4, 0], [0, 0]],
          [[1, 1], [1, 2], [2, 2], [2, 1]]],
        objects: {
          layer1: {
            type: "Polygon",
            arcs: [[0], [1, ~1]]
          }
        }
      };
      var dataset = api.internal.importTopoJSON(topology, {});
      // TODO: consider not assigning a geometry type if there are no shapes
      assert.deepEqual(dataset.layers[0], {
        name: 'layer1',
        data: null,
        shapes: [[[0]]],
        geometry_type: 'polygon'
      });
    })

    it('error on nested GeometryCollection objects of mixed types', function() {
      var topology = {
        arcs: [[[0, 0], [0, 1]]],
        objects: {
          points: {
            type: "GeometryCollection",
            geometries: [{
              type: "GeometryCollection",
              properties: {type: "A"},
              geometries: [{
                type: "Point",
                coordinates: [1, 2]
              }, {
                type: "LineString",
                arcs: [0]
              }]
            }]
          }
        }
      };
      assert.throws(function() {
        api.internal.importTopoJSON(topology, {});
      }, /Unable to import mixed/);
    })

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
      var lyr = TopoJSON.importObject(obj, null, {id_field: 'foo'})[0];
      var records = lyr.data.getRecords();
      assert.deepEqual(records, [{foo: 'bar'}]);
    })
  })


});