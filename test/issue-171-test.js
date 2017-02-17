var api = require('../'),
    assert = require('assert');

describe('Issue #171: Invalid GeoJSON output when attribute data contains $&', function () {
  it ('test', function(done) {
    var geojson = {
      type: 'Feature',
      properties: {foo: ' $& '}
    };

    var cmd = '-i input.json -o output.json';
    api.applyCommands(cmd, {'input.json': geojson}, function(err, output) {
      JSON.parse(output['output.json']); // throws if JSON is invalid
      done();
    });
  });

});
