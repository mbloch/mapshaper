var api = require('../'),
    SVG = api.internal.svg,
    assert = require('assert');

describe('mapshaper-svg.js', function () {
  it ('default scaling w/ 1px margin', function(done) {
    var geo = {
      type: 'LineString',
      coordinates: [[0, 0], [1, 2]]
    };
    var cmd = '-rename-layers line -o format=svg';

    api.applyCommands(cmd, geo, function(err, data) {
      var svg = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="800" height="1598" viewBox="0 0 800 1598">\n' +
      '<g id="line" stroke="black">\n<path d="M 1 1597 799 1"/>\n</g>\n</svg>'
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
      var svg = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="800" height="800" viewBox="0 0 800 800">\n' +
      '<g id="layer1" fill="black">\n<g id="dots">\n<circle cx="1" cy="1" r="2"/>\n<circle cx="799" cy="799" r="2"/>\n</g>\n</g>\n</svg>'
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
      var svg = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="10" height="20" viewBox="0 0 10 20">\n' +
      '<g id="layer1" fill="black">\n<circle cx="10" cy="20" r="2"/>\n<circle cx="0" cy="0" r="2"/>\n</g>\n</svg>'
      assert.equal(data, svg)
      done();
    });
  });

});