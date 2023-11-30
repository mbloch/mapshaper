import assert from 'assert';
import api from '../mapshaper.js';


describe('mapshaper-shape.js', function () {

  it ('create a polyline', function(done) {
    api.applyCommands('-shape coordinates=10,10 offsets=0,10,10,0,0,-10 -o out.json', {}, function(err, output) {
      var line = JSON.parse(output['out.json']).geometries[0];
      assert.deepEqual(line, {
        type: 'LineString',
        coordinates: [[10,10], [10,20], [20,20], [20,10]]
      })
      done();
    })
  })

  it ('create a polygon with closed and offsets= option', function(done) {
    api.applyCommands('-shape coordinates=10,10 offsets=0,10,10,0,0,-10 closed -o out.json gj2008', {}, function(err, output) {
      var line = JSON.parse(output['out.json']).geometries[0];
      assert.deepEqual(line, {
        type: 'Polygon',
        coordinates: [[[10,10], [10,20], [20,20], [20,10], [10,10]]]
      })
      done();
    })
  })

  it ('create a polygon from coordinates', function(done) {
    api.applyCommands('-shape coordinates=10,10,10,20,20,20,20,10,10,10 -o out.json gj2008', {}, function(err, output) {
      var line = JSON.parse(output['out.json']).geometries[0];
      assert.deepEqual(line, {
        type: 'Polygon',
        coordinates: [[[10,10], [10,20], [20,20], [20,10], [10,10]]]
      })
      done();
    })
  })

})
