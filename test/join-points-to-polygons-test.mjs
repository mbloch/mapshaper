import api from '../mapshaper.js';
import assert from 'assert';

var ArcCollection = api.internal.ArcCollection,
    DataTable = api.internal.DataTable;

describe('Points to polygons and polygons to points spatial join', function () {
  describe('Bug fix: need to handle congruent / overlapping polygons', function () {

    it('join point to two congruent polygons', function(done) {
      var polygons = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'Polygon',
          coordinates: [[[0,0], [0,1], [1,1], [1,0], [0,0]]]
        }, {
          type: 'Polygon',
          coordinates: [[[0,0], [0,1], [1,1], [1,0], [0,0]]]
        }]
      };
      var point = {
        type: 'Feature',
        properties: {a: 'foo'},
        geometry: {
          type: "Point", coordinates: [0.5, 0.5]
        }
      };

      api.applyCommands('-i point.json -i polygons.json -join point -o output.json',
          {'polygons.json': polygons, 'point.json': point}, function(err, o) {
          var out = JSON.parse(o['output.json']);
          assert.deepEqual(out.features[0].properties, {a: 'foo'});
          assert.deepEqual(out.features[1].properties, {a: 'foo'});
           done();
        });
    });


    it('join two congruent polygons to point', function(done) {
      var polygons = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {foo: 2},
            geometry: {
            type: 'Polygon',
            coordinates: [[[0,0], [0,1], [1,1], [1,0], [0,0]]]
          }
        }, {
          type: 'Feature',
          properties: {foo: 3},
            geometry: {
            type: 'Polygon',
            coordinates: [[[0,0], [0,1], [1,1], [1,0], [0,0]]]
          }
        }]
      };
      var point = {
        type: 'Feature',
        properties: {id: "bar"},
        geometry: {
          type: "Point", coordinates: [0.5, 0.5]
        }
      };

      api.applyCommands('-i polygons.json -i point.json -join polygons calc="foo = sum(foo)" -o output.json',
          {'polygons.json': polygons, 'point.json': point}, function(err, o) {
          var out = JSON.parse(o['output.json']);
          assert.deepEqual(out.features[0].properties, {id: 'bar', foo: 5});
          done();
        });
    });
  })

  describe('joinPointsToPolygons()', function () {
    it('simple point to polygon join', function () {
      var arcs = [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]];
      var target = {
        arcs: new ArcCollection(arcs),
        layers: [{
          geometry_type: 'polygon',
          shapes: [[[0]]]
        }]
      };
      var src = {
        geometry_type: 'point',
        shapes:[[[0.5, 0.5]], [[2, 0]]],
        data: new DataTable([{foo: 'a'}, {foo: 'z'}])
      };
      var opts = {};
      api.internal.joinPointsToPolygons(target.layers[0], target.arcs, src, opts);
      assert.deepEqual(target.layers[0].data.getRecords(), [{foo: 'a'}] )
    })


    it('join several points to polygon', function () {
      var arcs = [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]];
      var target = {
        arcs: new ArcCollection(arcs),
        layers: [{
          geometry_type: 'polygon',
          shapes: [[[0]]]
        }]
      };
      var src = {
        geometry_type: 'point',
        shapes:[[[0.5, 0.5]], [[0.25, 0.75]]],
        data: new DataTable([{count: 1, foo: 'a'}, {count: 3, foo: 'b'}])
      };
      var opts = {calc: "joins = _.count(), total=sum(count)"};
      api.internal.joinPointsToPolygons(target.layers[0], target.arcs, src, opts);
      assert.deepEqual(target.layers[0].data.getRecords(), [{
        total: 4,
        joins: 2,
        // foo: 'a',
        // count: 1
      }] )
    })

    it('simple polygon to point join', function () {
      var arcs = new ArcCollection([[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]);
      var src = {
          geometry_type: 'polygon',
          shapes: [[[0]]],
          data: new DataTable([{foo: 'a'}])
      };
      var target = {
        layers: [{
          geometry_type: 'point',
          shapes:[[[0.5, 0.5]], [[2, 0]]]
        }]
      };
      var opts = {};
      api.internal.joinPolygonsToPoints(target.layers[0], src, arcs, opts);
      assert.deepEqual(target.layers[0].data.getRecords(), [{foo: 'a'}, {foo: null}] )
    })

    it('join polygon to multiple points', function () {
      var arcs = new ArcCollection([[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]);
      var src = {
          geometry_type: 'polygon',
          shapes: [[[0]]],
          data: new DataTable([{foo: 'a'}])
      };
      var target = {
        layers: [{
          geometry_type: 'point',
          shapes:[[[0.5, 0.5]], [[0.25, 0.7]]]
        }]
      };
      var opts = {};
      api.internal.joinPolygonsToPoints(target.layers[0], src, arcs, opts);
      assert.deepEqual(target.layers[0].data.getRecords(), [{foo: 'a'}, {foo: 'a'}] )
    })

  })
});
