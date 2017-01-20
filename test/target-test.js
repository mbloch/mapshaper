var api = require('../'),
    assert = require('assert');

describe('mapshaper-target.js', function () {

  it('target second of two datasets', function(done) {
    var cmd = "-i test/test_data/three_points.shp -i test/test_data/text/states.csv -target states -o";
    api.applyCommands(cmd, {}, function(err, output) {
      assert('states.csv' in output);
      done();
    })
  })

  it('error if no layer is matched', function(done) {
    var cmd = "-i test/test_data/three_points.shp -target states";
    api.runCommands(cmd, function(err) {
      assert.equal(err.name, 'APIError');
      done();
    })
  })

  it('error if multiple layers are matched', function(done) {
    var cmd = "-i test/test_data/three_points.shp -i test/test_data/three_points.shp -target three_points";
    api.runCommands(cmd, function(err) {
      assert.equal(err.name, 'APIError');
      done();
    })
  })
})