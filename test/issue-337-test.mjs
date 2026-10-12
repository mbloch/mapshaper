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

  it ('erase test: original geometry unmodified', async function() {
    var cmd = '-i target.json -i clip.json -erase target=target clip -o gj2008';
    var output = await api.applyCommands(cmd, {'target.json': target, 'clip.json': clip});
    var json = JSON.parse(output['target.json']);
    // same shape as the original, with the hole wound counter-clockwise
    var expected = {
      type: "Polygon",
      coordinates: [
        [[1, 6], [6, 6], [6, 1], [1, 1], [1, 6]],
        [[2, 5], [2, 2], [5, 2], [5, 5], [2, 5]]
      ]
    };
    assert.deepEqual(json.geometries, [expected]);
  });


});
