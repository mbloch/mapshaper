
var api = require('../'),
  internal = api.internal,
  assert = require('assert');


function testSortedIds(ids, arr) {
  for (var i=1, n=ids.length; i<n; i++) {
    if (arr[ids[i]] < arr[ids[i-1]]) {
      return false;
    }
  }
  return true;
};


describe('mapshaper-snapping.js', function () {
  /*
  describe('bucketSortIds()', function () {
    it('test 1', function () {
      var arr = [2, 0, 1, -1, -1, 0, 3];

      assert(testSortedIds(api.utils.bucketSortIds(arr, 1), arr));
      assert(testSortedIds(api.utils.bucketSortIds(arr, 2), arr));
      assert(testSortedIds(api.utils.bucketSortIds(arr, 3), arr));
      assert(testSortedIds(api.utils.bucketSortIds(arr, 4), arr));
      assert(testSortedIds(api.utils.bucketSortIds(arr, 5), arr));
    })
  })
  */

  describe('getHighPrecisionSnappingInterval()', function() {
    it('latlong range', function() {
      var interval = internal.getHighPrecisionSnapInterval([-180, -90]);
      assert(interval < 1e-11);
    })

    it('meter range', function() {
      var interval = internal.getHighPrecisionSnapInterval([-410237,1062963,-415294,1066765]);
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

  describe('sortCoordinateIds()', function () {

    it('test 2', function () {
      var arr = [];
      api.utils.repeat(10000, function() {
        arr.push(Math.random());
      });

      var ids = api.internal.sortCoordinateIds(arr);
      assert(testSortedIds(ids, arr));
    })

  })

})