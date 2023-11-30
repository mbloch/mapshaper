import api from '../mapshaper.js';
import assert from 'assert';


describe('mapshaper-filter-geom.js', function () {

  describe('bbox= option', function () {

    it('error: missing geometry', function(done) {
      var data = [{foo: "bar"}];
      api.applyCommands('-i data.json -filter-geom bbox=0,0,1,1 -o', {'data.json':data}, function(err, out) {
        assert.equal(err.name, 'UserError');
        done();
      })
    })

    it('point layer', function (done) {
      var points = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'MultiPoint',
          coordinates: [[0, 0], [180, 0], [180, -1], [-180, 90]]
        }, {
          type: 'Point',
          coordinates: [10, -10]
        }]
      };
      var expected = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'MultiPoint',
          coordinates: [[0, 0], [180, 0], [-180, 90]]
        }]
      };
      var cmd = '-i points.json -filter-geom bbox=-180,0,180,90 -o';
      api.applyCommands(cmd, {'points.json': points}, function(err, out) {
        var result = JSON.parse(out['points.json']);
        assert.deepEqual(result, expected)
        done();
      });
    })

    it('polyline layer', function (done) {
      var lines = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'MultiLineString',
          coordinates: [[[0, 0], [0, -10]], [[180, -1], [179, -2]], [[-180, 90], [-180, 89]]]
        }, {
          type: 'LineString',
          coordinates: [[10, -10], [11, -11]]
        }]
      };
      var expected = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'MultiLineString',
          coordinates: [[[0, 0], [0, -10]], [[-180, 90], [-180, 89]]]
        }]
      };
      var cmd = '-i lines.json -filter-geom bbox=-180,0,180,90 -o';
      api.applyCommands(cmd, {'lines.json': lines}, function(err, out) {
        var result = JSON.parse(out['lines.json']);
        assert.deepEqual(result, expected)
        done();
      });
    });

  })

})
