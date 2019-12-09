var api = require('../'),
    assert = require('assert');

describe('Points to points spatial join', function () {
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
