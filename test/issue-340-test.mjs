import api from '../mapshaper.js';
import assert from 'assert';


describe('Issue #340 (-join unmatched unjoined should not change target layers)', function () {

  it('unjoined unmatched not added to default target', function(done) {
    api.applyCommands('-i test/data/three_points.geojson -join test/data/three_points.geojson unjoined unmatched keys=name,name_alt -o', function(err, output) {
      assert.deepEqual(Object.keys(output), ['three_points.json']); // only data layer is included in output
      done();
    });
  });

  it('... but are generated', function(done) {
    api.applyCommands('-i test/data/three_points.geojson -join test/data/three_points.geojson unjoined unmatched keys=name,name_alt -o target=*', function(err, output) {
      assert.deepEqual(Object.keys(output), ['three_points.json', 'unmatched.json', 'unjoined.json']); // debugging layers are generated
      done();
    });
  });


});
