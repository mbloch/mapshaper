import api from '../mapshaper.js';
import assert from 'assert';


describe('Issue #538 (Holes can disappear in GeoJSON output and after -explode)', function () {

  it('test', function(done) {
    var cmd = '-i test/data/issues/538_missing_holes/multipolygon.json -explode -o';
    api.applyCommands(cmd, {}, function(err, out) {
      var json = JSON.parse(out['multipolygon.json']);
      assert.equal(json.geometries[0].coordinates.length, 1)
      assert.equal(json.geometries[1].coordinates.length, 2) // second polygon contains a hol
      done();
    })
  });
});
