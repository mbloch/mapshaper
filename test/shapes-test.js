var api = require('../gui/www/mapshaper.js'),
  assert = require('assert'),
  ArcCollection = api.ArcCollection,
  BoundingBox = api.BoundingBox,
  trace = api.trace;

var arcs1 = [
  [[0, 1], [0, 1]],
  [[1, 2], [1, 2]],
  [[0, 1], [-1, 1]]
];

describe('mapshaper-shapes.js', function () {
  describe('ArcCollection', function () {
    var coll;
    beforeEach(function() {
      coll = new ArcCollection(arcs1);
    })

    it("#size() returns the correct number of arcs", function() {
      assert.equal(3, coll.size());
    })

    it('#getBounds() returns the correct bounding box', function () {
      assert.deepEqual({left:0, top:2, right:2, bottom:-1}, coll.getBounds())
    })

  })

})
