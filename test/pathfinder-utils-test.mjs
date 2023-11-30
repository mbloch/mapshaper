import api from '../mapshaper.js';
import assert from 'assert';
var ArcCollection = api.internal.ArcCollection,
    NodeCollection = api.internal.NodeCollection;

describe('mapshaper-pathfinder-utils.js', function () {

  describe('getRightmostArc()', function () {
    function test(arcId, coords, filter) {
      var arcs = new ArcCollection(coords);
      var nodes = new NodeCollection(arcs);
      return api.internal.getRightmostArc(arcId, nodes, filter);
    }

    describe('error conditions', function() {
      it('collapsed arc', function() {
        var coords = [
          [[0, 0], [1, 1]],
          [[0, 0], [0, 0]]
        ];
        assert.throws(function() {
          var nodes = new NodeCollection(new ArcCollection(coords));
          var arcId = api.internal.getRightmostArc(~0, nodes);
        });
      })
    })

    it('tests A', function () {
      var coords = [
        [[-1, -1], [1, 1]],
        [[-1, 1], [1, 1]],
        [[1, 1], [2, 2]],
        [[2, 1], [1, 1]]
      ];
      assert.equal(test(0, coords), 3);
      assert.equal(test(1, coords), 0);
      assert.equal(test(~2, coords), 1);
      assert.equal(test(3, coords), ~2);
    })

  })

  describe('chooseRighthandVector()', function () {
    var f = api.internal.chooseRighthandVector;
    it ('first vector is rightmost', function() {
      assert.equal(f(0.1, 5, -0.1, 2), 1);
      assert.equal(f(-0.1, -2, 0.1, -5), 1);
      assert.equal(f(5, -0.1, 2, 0.1), 1);
      assert.equal(f(-5, 0.1, -6, -0.1), 1);
    });

    it ('second vector is rightmost', function() {
      assert.equal(f(-0.1, 6, 0.1, 5), 2);
      assert.equal(f(0.1, -5, -0.1, -2), 2);
      assert.equal(f(2, 0.1, 5, -0.1), 2);
      assert.equal(f(-2, -0.1, -5, 0.1), 2);
    });

    it ('same slope (error)', function() {
      assert.equal(f(0, 1, 0, 2), 0);
      assert.equal(f(1, 1, 2, 2), 0);
      assert.equal(f(-1, 1, -2, 2), 0);
      assert.equal(f(0, -1, 0, -2), 0);
      assert.equal(f(1, 0, 2, 0), 0);
      assert.equal(f(-1, 0, -2, 0), 0);
    });

    it ('small distances', function() {
      assert.equal(f(-1, -1.734723475976807e-18, -1, 0), 2)
      assert.equal(f(-1, -1.734723475976807e-18, -1000, 0), 2)
      assert.equal(f(-1000, -1.734723475976807e-18, -100, 0), 2)
      assert.equal(f(-1, 1.734723475976807e-18, -1, 0), 1)
      assert.equal(f(-1, 1.734723475976807e-18, -1000, 0), 1)
      assert.equal(f(-1000, 1.734723475976807e-18, -100, 0), 1)
    })
  })

})