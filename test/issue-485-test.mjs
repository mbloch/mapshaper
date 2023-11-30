import api from '../mapshaper.js';
import assert from 'assert';


describe('Issue #485 (Error importing files with * wildcard)', function () {

  it('match files with *', function(done) {
    var cmd = '-i test/data/issues/485_wildcard/* -o';
    api.applyCommands(cmd, {}, function(err, out) {
      var json = JSON.parse(out['three_points.json']);
      assert.equal(json.features.length, 3);
      done();
    })
  });
});
