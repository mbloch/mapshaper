var api = require('../'),
    assert = require('assert'),
    ArcCollection = api.internal.ArcCollection,
    DataTable = api.internal.DataTable;

describe('mapshaper-spatial-join.js', function () {

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
      api.joinPointsToPolygons(target.layers[0], target.arcs, src, opts);
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
      var opts = {sum_fields: ['count']};
      api.joinPointsToPolygons(target.layers[0], target.arcs, src, opts);
      assert.deepEqual(target.layers[0].data.getRecords(), [{count: 4, foo: 'a', joins: 2}] )
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
      api.joinPolygonsToPoints(target.layers[0], src, arcs, opts);
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
      api.joinPolygonsToPoints(target.layers[0], src, arcs, opts);
      assert.deepEqual(target.layers[0].data.getRecords(), [{foo: 'a'}, {foo: 'a'}] )
    })

  })

});
