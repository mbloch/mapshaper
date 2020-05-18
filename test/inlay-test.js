var assert = require('assert'),
    api = require("../"),
    fs = require('fs');

describe('mapshaper-inset.js', function () {

  it('-inset inscribes polygons into polygons', function(done) {
    var inner = 'test/data/features/inlay/ex1_inner.json';
    var outer = 'test/data/features/inlay/ex1_outer.json';
    var cmd = `-i ${outer} -inlay ${inner} -o`;
    var innerInput = JSON.parse(fs.readFileSync(inner));
    api.applyCommands(cmd, function(err, out) {
      var json = JSON.parse(out['ex1_outer.json']);
      // second feature has a notch cut out of it
      var feat2 = {
        "type": "Feature",
        "properties": {"foo": "b"},
        "geometry": {
          "type": "Polygon",
          "coordinates": [[[2, 0], [4, 0], [4, 3], [2, 3], [2, 2], [3, 2],
            [3, 1], [2, 1], [2, 0]]]
        }
      };
      assert.deepEqual(json.features[1], feat2);
      // Inner features are preserved
      assert.deepEqual(json.features.slice(2), innerInput.features);
      done();
    });
  });
});
