var api = require('../gui/www/mapshaper.js'),
  assert = require('assert'),
  ArcDataset = api.ArcDataset,
  BoundingBox = api.BoundingBox,
  trace = api.trace;

var arcs1 = [
  [[0, 1], [0, 1]],
  [[1, 2], [1, 2]],
  [[0, 1], [-1, 1]]
];

describe('mapshaper-shapes.js', function () {
  describe('ArcDataset', function () {
    var coll;
    beforeEach(function() {
      coll = new ArcDataset(arcs1);
    })

    it("#size() returns the correct number of arcs", function() {
      assert.equal(3, coll.size());
    })

    it('#getBounds() returns the correct bounding box', function () {
      assert.deepEqual({xmin:0, ymax:2, xmax:2, ymin:-1}, coll.getBounds())
    })

  })

})
