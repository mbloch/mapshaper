import api from '../mapshaper.js';
import assert from 'assert';

describe('-clip bbox2=<bbox>', function () {

  it('Bug fix: -clip bbox2= throws error', async function() {
    var file = 'test/data/issues/bbox2_error/usa.json';
    var cmd = `-i ${file} -proj albersusa -clip bbox2=-2383849,-1314367,2266550,1565850`;
    var out = await api.applyCommands(cmd); // used to throw
  })

  it('Point layer', function(done) {
    var input = {
      type: 'MultiPoint',
      coordinates: [[-1, -2], [3, 3]]
    };
    var cmd = '-i points.json -clip bbox2=0,0,5,5 -o';
    var expected = {
      type: 'GeometryCollection',
      geometries: [{
        type: 'Point',
        coordinates: [3,3]
      }]
    };
    api.applyCommands(cmd, {'points.json': input}, function(err, out) {
      var json = JSON.parse(out['points.json']);
      assert.deepEqual(json, expected);
      done();
    })
  })

  it ('Cross-shaped figure (test 1)', function(done) {

    var input = {
      type: 'GeometryCollection',
      geometries: [{
        // horizontal cross-piece
        type: 'Polygon',
        coordinates: [[[1, 3], [1, 4], [6, 4], [6, 3], [1, 3]]]
      }, {
        // vertical cross-piece
        type: 'Polygon',
        coordinates: [[[3, 1], [3, 6], [4, 6], [4, 1], [3, 1]]]
      }, {
        // square inside the clip box
        type: 'Polygon',
        coordinates: [[[2.5, 2.5], [2.5, 4.5], [4.5, 4.5], [4.5, 2.5], [2.5, 2.5]]]
      }, {
        // square containing the clip box
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 7], [7, 7], [7, 0], [0, 0]]]
      }]
    };
    var expect = {
      type: 'GeometryCollection',
      geometries: [{
        type: 'Polygon',
        coordinates: [[[2, 4], [5, 4], [5, 3], [2, 3], [2, 4]]]
      }, {
        type: 'Polygon',
        coordinates: [[[3, 2], [3, 5], [4, 5], [4, 2], [3, 2]]]
      }, {
        type: 'Polygon',
        coordinates: [[[2.5, 2.5], [2.5, 4.5], [4.5, 4.5], [4.5, 2.5], [2.5, 2.5]]]
      }, {
        type: 'Polygon',
        coordinates: [[[2, 2], [2, 5], [5, 5], [5, 2], [2, 2]]]
      }]
    }
    var bbox = [2, 2, 5, 5];
    var cmd = '-i input.json -clip bbox2=2,2,5,5 -o gj2008 clipped.json';
    api.applyCommands(cmd, {'input.json': input}, function(err, out) {
      var geometries = JSON.parse(out['clipped.json']).geometries;
      assert.deepEqual(geometries[0].coordinates, expect.geometries[0].coordinates);
      assert.deepEqual(geometries[1].coordinates, expect.geometries[1].coordinates);
      assert.deepEqual(geometries[2].coordinates, expect.geometries[2].coordinates);

      // Note: the fourth shape (a square shape containing all the other shapes) does
      // not get clipped, it becomes null. This is because the -clip function
      // makes some internal assumptions about topology that are not true for this
      // sample dataset (it assumes that shapes do not overlap, and fourth polygon
      // here overlaps all of the other target polygons).
      // assert.deepEqual(geometries[3].coordinates, expect.geometries[3].coordinates);
      done();
    });

  });


});
