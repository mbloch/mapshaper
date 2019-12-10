var assert = require('assert'),
    api = require("../"),
    _ = require('underscore');

describe('mapshaper-mosaic.js', function () {
  var figure1 = {
    type: 'GeometryCollection',
    geometries: [{
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]]
    }, {
      type: 'Polygon',
      coordinates: [[[1, 1], [1, 3], [3, 3], [3, 1], [1, 1]]]
    }]
  };

  it ('creates a mosaic', function(done) {
    var o1 =
      [[[ 0, 0 ], [ 0, 2 ], [ 1, 2 ], [ 1, 1 ], [ 2, 1 ], [ 2, 0 ], [ 0, 0 ]]];
    var o2 =
      [[[ 1, 2 ], [ 2, 2 ], [ 2, 1 ], [ 1, 1 ], [ 1, 2 ]]];
    var o3 =
      [[[ 2, 1 ], [ 2, 2 ], [ 1, 2 ], [ 1, 3 ], [ 3, 3 ], [ 3, 1 ], [ 2, 1 ]]];
    var cmd = '-i input.json -mosaic -o';
    api.applyCommands(cmd, {'input.json': figure1}, function(err, out) {
      var output = JSON.parse(out['input.json']);

      assert.deepEqual(output.geometries[0].coordinates, o1);
      assert.deepEqual(output.geometries[1].coordinates, o2);
      assert.deepEqual(output.geometries[2].coordinates, o3);
      done();
    });
  });

  it ('-mosaic name= option works with +', function(done) {
    var cmd = '-i input.json -mosaic + name=cells -o';
    api.applyCommands(cmd, {'input.json': figure1}, function(err, out) {
      assert('cells.json' in out);
      done();
    });
  });

  it ('-mosaic name= option works without +', function(done) {
    var cmd = '-i input.json -mosaic name=cells -o';
    api.applyCommands(cmd, {'input.json': figure1}, function(err, out) {
      assert('cells.json' in out);
      done();
    });
  });

  it ('-mosaic calc= option works', function(done) {
    var cmd = '-i test/data/features/mosaic/two_polygons.json -mosaic calc="n=_.count(), names=collect(name)" -o output.json';
    api.applyCommands(cmd, {'input.json': figure1}, function(err, out) {
      var features = JSON.parse(out['output.json']).features;
      var data = _.pluck(features, 'properties');
      assert.deepEqual(data, [{names: ['A'], n: 1}, {names: ['A', 'B'], n: 2}, {names: ['B'], n: 1}])
      done();
    });
  });

})
