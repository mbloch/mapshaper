var assert = require('assert'),
    api = require("../"),
    util = require("./helpers.js");

describe('mapshaper-pixel-transform.js', function () {

  function test(opts, points, expectedPoints, expectedSize) {
    var dataset = {
      layers: [{
        geometry_type: 'point',
        shapes: [points]
      }]
    };
    var size = api.internal.transformDatasetToPixels(dataset, opts);
    var points2 = dataset.layers[0].shapes[0];
    expectedPoints.forEach(function(p, i) {
      util.almostEqual(points2[i][0], p[0]);
      util.almostEqual(points2[i][1], p[1]);
    });
    if (expectedSize) {
      assert.deepEqual(size, expectedSize);
    }
  }

  it ('width + margin + invert_y', function() {
    var points = [[0, 0], [50, 50]];
    var opts = {width: 800, margin: 10, invert_y: true};
    var target = [[10, 790], [790, 10]];
    var size = test(opts, points, target, [800, 800]);
  })

  it ('svg_scale + margin + invert_y', function() {
    var points = [[20, 20], [520, 270]];  // 2:1 aspect ratio
    var opts = {svg_scale: 2, margin: 10, invert_y: true};
    var target = [[10, 135], [260, 10]];
    var size = test(opts, points, target, [270, 145]);
  })

})