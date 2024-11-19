import assert from 'assert';
import api from '../mapshaper.js';
import util from './helpers';
var Bounds = api.internal.Bounds;

describe('mapshaper-frame-utils.js', function () {
  describe('calcOutputBounds()', function () {
    var calcOutputBounds = api.internal.calcOutputBounds;

    it('max-height option limits height of relatively tall maps', function () {
      var bounds = new Bounds(100, 200, 200, 400);
      var opts = {
        width: 10,
        max_height: 10,
        margin: 0
      };
      var bounds2 = calcOutputBounds(bounds, opts);
      assert.deepEqual(bounds2.toArray(), [0, 0, 10, 10])
      assert.deepEqual(bounds.toArray(), [50, 200, 250, 400]); // equal padding left and right
    });
  })

  function test(opts, points, expectedPoints, expectedSize) {
    var dataset = {
      layers: [{
        geometry_type: 'point',
        shapes: [points]
      }]
    };
    var frame = api.internal.getFrameData(dataset, opts);
    api.internal.fitDatasetToFrame(dataset, frame);
    var points2 = dataset.layers[0].shapes[0];
    expectedPoints.forEach(function(p, i) {
      util.almostEqual(points2[i][0], p[0]);
      util.almostEqual(points2[i][1], p[1]);
    });
    if (expectedSize) {
      assert.equal(frame.width, expectedSize[0]);
      assert.equal(frame.height, expectedSize[1]);
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

  describe('parseMarginOption()', function () {
    var parse = api.internal.parseMarginOption;
    it('tests', function () {
      assert.deepEqual(parse('1'), [1,1,1,1]);
      assert.deepEqual(parse(), [0,0,0,0]);
      assert.deepEqual(parse(null), [0,0,0,0]);
      assert.deepEqual(parse('0'), [0,0,0,0]);
      assert.deepEqual(parse('3, 1'), [3,1,3,1]);
      assert.deepEqual(parse('3 1 2'), [3,1,2,2]);
      assert.deepEqual(parse('0,12,9,0'), [0,12,9,0]);
    })
  })
})