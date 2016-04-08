var api = require('../'),
    SVG = api.internal.svg,
    assert = require('assert');

describe('mapshaper-svg.js', function () {

  it('outputs svg file if output filename ends in ".svg"', function(done) {
    api.internal.processFileContent('-i test/test_data/two_states.shp -o two_states.svg', null, function(err, output) {
      assert.equal(output[0].filename, 'two_states.svg');
      assert(/^<\?xml version="1.0"\?>/.test(output[0].content));
      done();
    });
  });

  it ('default scaling w/ 1px margin', function(done) {
    var geo = {
      type: 'Feature',
      properties: {
        'stroke_width': 1,
        stroke: 'black'
      },
      geometry: {
        type: 'LineString',
        coordinates: [[0, 0], [1, 2]]
      }
    };
    var cmd = '-rename-layers line -o format=svg';

    api.applyCommands(cmd, geo, function(err, data) {
      var svg = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="800" height="1598" viewBox="0 0 800 1598" stroke-linecap="round" stroke-linejoin="round">\n' +
      '<g id="line">\n<path d="M 1 1597 799 1" stroke-width="1" stroke="black"/>\n</g>\n</svg>'

      assert.equal(data, svg)
      done();
    });
  });

  it ('id-field= works', function(done) {
    var geo = {
      type: 'Feature',
      geometry: {
        type: 'MultiPoint',
        coordinates: [[0, 2], [2, 0]]
      },
      properties: {name: 'dots'}
    };
    var cmd = '-o id-field=name format=svg';

    api.applyCommands(cmd, geo, function(err, data) {
      var svg = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="800" height="800" viewBox="0 0 800 800" stroke-linecap="round" stroke-linejoin="round">\n' +
      '<g id="layer1">\n<g id="dots">\n<circle cx="1" cy="1"/>\n<circle cx="799" cy="799"/>\n</g>\n</g>\n</svg>';

      assert.equal(data, svg)
      done();
    });
  });

  it ('width= and margin= options work', function(done) {
    var geo = {
      type: 'GeometryCollection',
      geometries: [{
        type: 'Point',
        coordinates: [0, -10]
      }, {
        type: 'Point',
        coordinates: [-10, 10]
      }]
    };
    var cmd = '-o width=10 margin=0 format=svg';

    api.applyCommands(cmd, geo, function(err, data) {
      var svg = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="10" height="20" viewBox="0 0 10 20" stroke-linecap="round" stroke-linejoin="round">\n' +
      '<g id="layer1">\n<circle cx="10" cy="20"/>\n<circle cx="0" cy="0"/>\n</g>\n</svg>';

      assert.equal(data, svg)
      done();
    });
  });
});
