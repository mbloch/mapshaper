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
      '<g id="line" stroke="black">\n<path d="M1 1597 L799 1"/>\n</g>\n</svg>'
      assert.equal(data, svg)
      done();
    });

  });
});