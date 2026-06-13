import api from '../mapshaper.js';
import assert from 'assert';
import { getHighPrecisionSnapInterval, sortIds } from '../src/paths/mapshaper-snapping';



function testSortedIds(ids, arr) {
  for (var i=1, n=ids.length; i<n; i++) {
    if (arr[ids[i]] < arr[ids[i-1]]) {
      return false;
    }
  }
  return true;
};

function freshIds(n, typed) {
  var ids = typed ? new Uint32Array(n) : [];
  for (var i = 0; i < n; i++) ids[i] = i;
  return ids;
}


describe('mapshaper-snapping.js', function () {

  describe('sortIds()', function () {
    it('sorts ids by their value in the key array (small input)', function () {
      var arr = [2, 0, 1, -1, -1, 0, 3];
      var ids = sortIds(arr, freshIds(arr.length, false));
      assert(testSortedIds(ids, arr));
    });

    it('handles the large bucket-sort path on various distributions', function () {
      var n = 5000;
      var dists = {
        uniform: function() { return Math.random() * 1e6; },
        clustered: function() { return (Math.random() * 5 | 0) * 1e5 + Math.random() * 10; },
        ties: function() { return (Math.random() * 20 | 0); },
        negatives: function() { return (Math.random() - 0.5) * 1e6; }
      };
      Object.keys(dists).forEach(function(name) {
        var arr = new Float64Array(n);
        for (var i = 0; i < n; i++) arr[i] = dists[name]();
        assert(testSortedIds(sortIds(arr, freshIds(n, true)), arr), name);
      });
    });

    it('sorts in place and returns the same array', function () {
      var arr = new Float64Array(200);
      for (var i = 0; i < 200; i++) arr[i] = 200 - i;
      var ids = freshIds(200, true);
      var result = sortIds(arr, ids);
      assert.strictEqual(result, ids);
      assert(testSortedIds(ids, arr));
    });

    it('handles all-equal values, empty and singleton inputs', function () {
      var equal = new Float64Array(100); // all zero
      assert(testSortedIds(sortIds(equal, freshIds(100, true)), equal));
      assert.deepEqual(sortIds([5], [0]), [0]);
      assert.deepEqual(sortIds([], []), []);
    });

    it('works on a plain Array of arbitrary (endpoint-style) ids', function () {
      var arr = new Float64Array(300);
      for (var i = 0; i < 300; i++) arr[i] = Math.sin(i) * 1000;
      var ids = []; // sparse, like getEndpointIds()
      for (var k = 0; k < 300; k += 2) ids.push(k);
      assert(testSortedIds(sortIds(arr, ids), arr));
    });
  });

  describe('getHighPrecisionSnappingInterval()', function() {
    it('latlong range', function() {
      var interval = getHighPrecisionSnapInterval([-180, -90]);
      assert(interval < 1e-11);
    })

    it('meter range', function() {
      var interval = getHighPrecisionSnapInterval([-410237,1062963,-415294,1066765]);
      assert(interval < 1e-7);
    })
  });

  describe('-i snap', function () {
    it('polyline A, outside threshold', function (done) {
      var input = {
        type: 'LineString',
        coordinates: [[0, 0], [0.1, 0.1], [1, 1]]
      };
      api.applyCommands('-i snap-interval=0.11 line.json -o', {'line.json': input}, function(err, data) {
        var output = JSON.parse(data['line.json']);
        assert.deepEqual(output.geometries[0].coordinates, input.coordinates);
        done();
      });
    })


    it('polyline A, inside threshold', function (done) {
      var input = {
        type: 'LineString',
        coordinates: [[0, 0], [0.05, 0.05], [0.1, 0.1], [1, 1], [1.1, 1.1]]
      };
      api.applyCommands('-i snap-interval=0.2 line.json -o', {'line.json': input}, function(err, data) {
        var output = JSON.parse(data['line.json']);
        assert.deepEqual(output.geometries[0].coordinates, [[0, 0],  [1, 1]]);
        done();
      });
    })

  })

  describe('-snap command', function() {
    it('interval=0.2', async function() {
      var input = {
        type: 'LineString',
        coordinates: [[0, 0], [0.05, 0.05], [0.1, 0.1], [1, 1], [1.1, 1.1]]
      };
      var cmd = '-i line.json -snap interval=0.2 -o';
      var output = await api.applyCommands(cmd, {'line.json': input});
      var line = JSON.parse(output['line.json']);
      var target = {
        type: 'LineString',
        coordinates: [[0, 0], [1, 1]]
      };
      assert.deepEqual(line.geometries[0], target);
    });

    it('fix-geometry option', async function() {
      var file = 'test/data/shapefile/six_counties.shp';
      var cmd = `-i ${file} -snap precision=0.0001 fix-geometry -check-geometry strict`;
      await api.applyCommands(cmd); // throws if geometry error
    });

  });

  describe('sortCoordinateIds()', function () {

    // it('test 2', function () {
    //   var arr = [];
    //   api.utils.repeat(10000, function() {
    //     arr.push(Math.random());
    //   });

    //   var ids = sortCoordinateIds(arr);
    //   assert(testSortedIds(ids, arr));
    // })

  })

})