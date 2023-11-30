import assert from 'assert';
import api from '../mapshaper.js';
var geom = api.geom;


describe('mapshaper-dissolve.js (points)', function () {

  it('multipoints are not supported', function() {
    assert.throws(function() {
      var lyr = {
        geometry_type: 'point',
        shapes: [[[1, 1], [0, 0]]]
      };
      api.cmd.dissolve(lyr, null);
    })
  });

  it('no field -> finds centroid of all points', function() {
    var lyr = {
      geometry_type: 'point',
      shapes: [[[1, 1]], [[0, 0]], [[0, 1]], [[1, 0]]]
    };

    var lyr2 = api.cmd.dissolve(lyr, null, {planar: true});
    assert.deepEqual(lyr2.shapes, [[[0.5, 0.5]]])
  })


  it('latlng coords -> finds centroid on surface of sphere', function() {
    var lyr = {
      geometry_type: 'point',
      shapes: [[[90, 45]], [[-90, 45]]]
    };

    var lyr2 = api.cmd.dissolve(lyr, null);
    assert.deepEqual(lyr2.shapes, [[[0, 90]]])
  })

  it('field -> finds centroid of groups of points, ignoring null points', function() {
    var lyr = {
      geometry_type: 'point',
      shapes: [null, [[1, 1]], [[0, 0]], [[2, 2]], [[1, 0]], [[2, 0]], [[0, 2]]],
      data: new api.internal.DataTable([{foo: 'a'}, {foo: 'a'}, {foo: 'a'}, {foo: 'a'}, {foo: 'b'}, {foo: 'c'}, {foo: 'c'}])
    };

    var lyr2 = api.cmd.dissolve(lyr, null, {field: 'foo', planar: true});
    assert.deepEqual(lyr2.shapes, [[[1, 1]], [[1, 0]], [[1, 1]]])
    assert.deepEqual(lyr2.data.getRecords(), [{foo: 'a'}, {foo: 'b'}, {foo: 'c'}]);
  })

  it('group-points option: group points instead of converting to centroid', function() {
    var lyr = {
      geometry_type: 'point',
      shapes: [null, [[1, 1]], [[0, 0]], [[2, 2]], [[1, 0]], [[2, 0]], [[0, 2]]],
      data: new api.internal.DataTable([{foo: 'a'}, {foo: 'a'}, {foo: 'a'}, {foo: 'a'}, {foo: 'b'}, {foo: 'c'}, {foo: 'c'}])
    };

    var lyr2 = api.cmd.dissolve(lyr, null, {field: 'foo', planar: true, group_points: true});
    assert.deepEqual(lyr2.shapes, [[[1, 1], [0, 0], [2, 2]], [[1, 0]], [[2, 0], [0, 2]]])
    assert.deepEqual(lyr2.data.getRecords(), [{foo: 'a'}, {foo: 'b'}, {foo: 'c'}]);
  })

  it('weighted centroid', function() {
    var lyr = {
      geometry_type: 'point',
      shapes: [[[1, 13]], [[0, 0]], [[1, 2]]],
      data: new api.internal.DataTable([{w: 0}, {w: 1}, {w: 3}])
    };

    var lyr2 = api.cmd.dissolve(lyr, null, {weight: 'w', planar: true});
    assert.deepEqual(lyr2.shapes, [[[0.75, 1.5]]])
  })

})
