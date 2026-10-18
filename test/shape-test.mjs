import assert from 'assert';
import api from '../mapshaper.js';


describe('mapshaper-shape.js', function () {

  it('+ is accepted, and the shape keeps its default name', async function() {
    var out = await api.applyCommands('-rectangle bbox=0,0,10,10 name=a ' +
      '-shape coordinates=0,0,1,1,1,0,0,0 + -o target=* format=geojson');
    assert.deepEqual(Object.keys(out).sort(), ['a.json', 'shape.json']);
  });

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
