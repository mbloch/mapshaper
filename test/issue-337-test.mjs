import api from '../mapshaper.js';
import assert from 'assert';


describe('Issue #337 (incorrect polygon erasure)', function () {

    //
    //  a ----------------- b
    //  |                   |
    //  |   i --------- j   |
    //  |   |           |   |
    //  |   |   e --f   |   |
    //  |   |   |   |   |   |
    //  |   |   h --g   |   |
    //  |   |           |   |
    //  |   l --------- k   |
    //  |                   |
    //  d ----------------- c
    //

    // the donut
    var target = {
      type: "Polygon",
      coordinates: [
        [[1, 6], [6, 6], [6, 1], [1, 1], [1, 6]],
        [[2, 5], [5, 5], [5, 2], [2, 2], [2, 5]]
      ]
    };

    // inside donut hole
    var clip = {
      type: "Polygon",
      coordinates: [[[3, 4], [4, 4], [4, 3], [3, 3], [3, 4]]]
    };


  it ('clip test: empty geometry', function(done) {
    var cmd = '-i target.json -i clip.json -clip target=target clip -o gj2008';
    api.applyCommands(cmd, {'target.json': target, 'clip.json': clip}, function(err, output) {
      var json = JSON.parse(output['target.json']);
      assert.deepEqual(json.geometries, []); // empty output
      done();
    });
  });

  it ('erase test: original geometry unmodified', function(done) {
    var cmd = '-i target.json -i clip.json -erase target=target clip -o gj2008';
    api.applyCommands(cmd, {'target.json': target, 'clip.json': clip}, function(err, output) {
      var json = JSON.parse(output['target.json']);
      assert.deepEqual(json.geometries, [target]); // output identical to original shape
      done();
    });
  });


});
