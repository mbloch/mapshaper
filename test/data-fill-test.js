var api = require('../'),
    assert = require('assert');


describe('mapshaper-data-fill.js', function () {
  it('works for simple case', function(done) {
    // two adjacent boxes
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {state: ''},
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
        }
      }, {
        type: 'Feature',
        properties: {state: 'IL'},
        geometry: {
          type: 'Polygon',
          coordinates: [[[1, 0], [1, 1], [2, 1], [2, 0], [1, 0]]]
        }
      }]
    };

    api.applyCommands('-i polygons.json -data-fill field=state -o',
      {'polygons.json': input}, function(err, output) {
        var features = JSON.parse(output['polygons.json']).features;
        assert.equal(features[0].properties.state, 'IL');
        assert.equal(features[1].properties.state, 'IL');
        done();
      });

  })
})
