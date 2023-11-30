import api from '../mapshaper.js';
import assert from 'assert';

describe('Points to points spatial join', function () {

  describe('lat-long coords', function () {
    var a = 'test/data/features/join/ex3_pointA.json';
    var b = 'test/data/features/join/ex3_pointB.json';

    it('antimeridian cross, etc', function (done) {
      var cmd = `-i ${a} -join ${b} max-distance=500km calc='ids = collect(id)' -o out.json`;
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['out.json']);
        assert.deepEqual(json.features[0].properties, {ids: ['A', 'B']})
        done();
      });
    })

    it('joining projected + unprojected datasets causes error', function (done) {
      var cmd = `-i ${a} -proj init=merc -join ${b} max-distance=500km calc='ids = collect(id)' -o out.json`;
      api.applyCommands(cmd, {}, function(err, out) {
        assert.equal(err.name, 'UserError');
        done();
      });
    })

  })

  describe('projected coords, max-distance= option', function () {
    var a = 'test/data/features/join/ex2_pointA.json';
    var b = 'test/data/features/join/ex2_pointB.json';
    it('test1', function(done) {
      var cmd = `-i ${a} -join ${b} max-distance=12 calc='ids = collect(id)' -o out.json`;
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['out.json']);
        assert.deepEqual(json.features[0].properties, {ids: ['A', 'B']})
        done();
      });
    })

    it('test2', function(done) {
      var cmd = `-i ${a} -join ${b} max-distance=1 calc='ids = collect(id)' -o out.json`;
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['out.json']);
        assert.deepEqual(json.features[0].properties, {ids: ['A']})
        done();
      });
    })
  })



  it('simple one-point join', function(done) {
    var a = {
      type: 'Point',
      coordinates: [1, 1]
    };
    var b = {
      type: 'Feature',
      properties: {id: 'foo'},
      geometry: {type: 'Point', coordinates: [1, 1]}
    };
    api.applyCommands('-i a.json -join b.json -o', {'a.json': a, 'b.json': b}, function(err, output) {
      var features = JSON.parse(output['a.json']).features;
      assert.deepEqual(features[0].properties, {id: 'foo'});
      done();
    });
  });
})
