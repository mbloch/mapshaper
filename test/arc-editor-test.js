var assert = require('assert'),
    mapshaper = require("../"),
    geom = mapshaper.geom;


describe("mapshaper-arc-editor.js", function() {

  describe('editArcs()', function () {
    it('arc coords are modified in-place', function () {
      var coords = [[[0, 0], [1, 2]], []],
          arcs = new mapshaper.internal.ArcCollection(coords);
      mapshaper.internal.editArcs(arcs, function(append, x, y, xp, yp, i) {
        append({x: x * 2, y: y * 3});
      });
      assert.deepEqual(arcs.toArray(), [[[0, 0], [2, 6]], []]);
    })

   it('throws an error if a defective arc is created', function () {
      var coords = [[[0, 0], [1, 2]]],
          arcs = new mapshaper.internal.ArcCollection(coords);
      assert.throws(function() {
        mapshaper.internal.editArcs(arcs, function(append, x, y, xp, yp, i) {
          if (i > 0) append({x: x, y: y});
        });
      })

    })

    it('previous coords are correctly passed', function () {
      var coords = [[], [[1, 1], [2, 3]], [[5, 3], [0, 2]]],
          arcs = new mapshaper.internal.ArcCollection(coords);
      mapshaper.internal.editArcs(arcs, function(append, x, y, xp, yp, i) {
        if (i > 0) {
          x += xp;
          y += yp;
        }
        append({x: x, y: y});
      });
      assert.deepEqual(arcs.toArray(), [[], [[1, 1], [3, 4]], [[5, 3], [5, 5]]]);
    })
  })

});