var api = require('../'),
    assert = require('assert');

describe('mapshaper-target.js', function () {

  it('target second of two datasets', function(done) {
    var cmd = "-i test/test_data/three_points.shp -i test/test_data/text/states.csv -target states -o";
    api.internal.processFileContent(cmd, null, function(err, output) {
      assert.equal(output[0].filename, 'states.csv');
      done();
    })
  })

  it('error if no layer is matched', function(done) {
    var cmd = "-i test/test_data/three_points.shp -target states";
    api.internal.processFileContent(cmd, null, function(err, output) {
      assert.equal(err.name, 'APIError');
      done();
    })
  })

  it('error if multiple layers are matched', function(done) {
    var cmd = "-i test/test_data/three_points.shp -i test/test_data/three_points.shp -target three_points";
    api.internal.processFileContent(cmd, null, function(err, output) {
      assert.equal(err.name, 'APIError');
      done();
    })
  })
})