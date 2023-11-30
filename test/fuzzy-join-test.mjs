import api from '../mapshaper.js';
import assert from 'assert';



// two adjacent boxes
//
//  . --- . --- .
//  |     |     |
//  |     |     |
//  . --- . --- .
//
var inputA = JSON.stringify({
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {name: 'A'},
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
    }
  }, {
    type: 'Feature',
    properties: {name: 'B'},
    geometry: {
      type: 'Polygon',
      coordinates: [[[1, 0], [1, 1], [2, 1], [2, 0], [1, 0]]]
    }
  }]
});

describe('mapshaper-fuzzy-join.js', function () {

  it('no-dropout option restores missing data areas', function(done) {

  var points = `x,y,d
0.5,0.5,b
0.5,0.5,b
0.5,0.5,a
1.5,0.5,b
1.5,0.5,b
1.5,0.5,b
`;
    var cmd = '-i points.csv -points -i polys.json -fuzzy-join field=d points no-dropouts -o format=json';
    api.applyCommands(cmd, {'points.csv': points, 'polys.json': inputA}, function(err, out) {
      var json = JSON.parse(out['polys.json'])
      assert.deepEqual(json, [{'name': 'A', 'join-count': 2, 'd': 'a'}, {'name': 'B', 'join-count': 3, 'd': 'b'}])
      done();
    });

  })


  it('dedup-points removes duplicate points', function(done) {

  var points = `x,y,d
0.5,0.5,b
0.5,0.5,b
0.5,0.5,b
0.5,0.5,a
0.6,0.5,a
1.5,0.5,b
1.5,0.5,b
1.5,0.5,b
`;
    var cmd = '-i points.csv -points -i polys.json -fuzzy-join field=d points dedup-points -o format=json';
    api.applyCommands(cmd, {'points.csv': points, 'polys.json': inputA}, function(err, out) {
      var json = JSON.parse(out['polys.json'])
      assert.deepEqual(json, [{'name': 'A', 'join-count': 2, 'd': 'a'}, {'name': 'B', 'join-count': 1, 'd': 'b'}])
      done();
    });

  })


});