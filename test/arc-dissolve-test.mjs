import api from '../mapshaper.js';
import assert from 'assert';

var ArcCollection = api.internal.ArcCollection;

describe('mapshaper-arc-dissolve.js', function () {

  describe('dissolveArcs()', function () {

    //      b --- c      e
    //     / \   /      / \
    //    /   \ /      /   \
    //   a --- d      g --- h

    var coords = [
      [[1, 1], [2, 2]],  // ab
      [[2, 2], [4, 2], [3, 1]],  // bcd
      [[2, 2], [3, 1]],  // bd
      [[3, 1], [1, 1]],  // da
      [[6, 2], [7, 1], [5, 1], [6, 2]]];  // ehge

    it('test 1', function () {
      var arcs = new api.internal.ArcCollection(coords);
      var layers = [{
            geometry_type: 'polygon',
            shapes: [[[0, 1, 3], [4]]]
          }];

      var targetArcs = [[[1, 1], [2, 2], [4, 2], [3, 1], [1, 1]], [[6, 2], [7, 1], [5, 1], [6, 2]]];
      var targetShapes = [[[0], [1]]];
      var dataset = {layers: layers, arcs: arcs};

      api.internal.dissolveArcs(dataset);
      assert.deepEqual(dataset.arcs.toArray(), targetArcs);
      assert.deepEqual(dataset.layers[0].shapes, targetShapes)
      assert.deepEqual(arcs.toArray(), coords); // arcs have not changed
    })

    it('test 2', function () {
      var arcs = new api.internal.ArcCollection(coords),
          layers = [{
            geometry_type: 'polygon',
            shapes: [[[~1, ~0, ~3]]]
          }];

      var targetArcs = [[[3, 1], [4, 2], [2, 2], [1, 1], [3, 1]]];
      var targetShapes = [[[0]]];
      var dataset = {layers: layers, arcs: arcs};

      api.internal.dissolveArcs(dataset);
      assert.deepEqual(dataset.arcs.toArray(), targetArcs);
      assert.deepEqual(dataset.layers[0].shapes, targetShapes)
      assert.deepEqual(arcs.toArray(), coords); // arcs have not changed
    })

    it('test 3', function () {
      var arcs = new api.internal.ArcCollection(coords),
          layers = [{
            geometry_type: 'polygon',
            shapes: [[[~1, ~0, ~3]], [[0, 1, 3], [4]]] // dcbad, abcda, eghe
          }];

      var targetArcs = [[[3, 1], [4, 2], [2, 2], [1, 1], [3, 1]], [[6, 2], [7, 1], [5, 1], [6, 2]]];
      var targetShapes = [[[0]], [[~0], [1]]];
      var dataset = {layers: layers, arcs: arcs};

      api.internal.dissolveArcs(dataset);
      assert.deepEqual(dataset.arcs.toArray(), targetArcs);
      assert.deepEqual(dataset.layers[0].shapes, targetShapes)
      assert.deepEqual(arcs.toArray(), coords); // arcs have not changed
    })

    it('test 4: line', function() {
      var coords = [[[0, 0], [1, 0]],
        [[1, 0], [1, 1], [2, 0]],
        [[2, 0], [1, 0]],
        [[2, 0], [3, 0]],
        [[3, 0], [2, -1], [2, 0]]];
      var arcs = new ArcCollection(coords);
      var layers = [{geometry_type: 'polyline', shapes: [[[0, ~2, 3]]]}];
      var dataset = {layers: layers, arcs: arcs};
      api.internal.dissolveArcs(dataset);
      assert.deepEqual(dataset.layers[0].shapes, [[[0]]]);
      assert.deepEqual(dataset.arcs.toArray(), [[[0, 0], [1, 0], [2, 0], [3, 0]]]);
      assert.deepEqual(arcs.toArray(), coords); // arcs have not changed
    });

    describe('issue #140 -- partially overlapping lines', function() {
      //
      //  b --- c
      //  |
      //  |
      //  a
      //
      var coords = [[[1, 1], [1, 2]], [[1, 2], [2, 2]]];
      it("test 1", function() {
        var arcs = new ArcCollection(coords);
        var layers = [{
          geometry_type: 'polyline',
          shapes: [[[0, 1]], [[0]]]
        }];
        api.internal.dissolveArcs({layers: layers, arcs: arcs});
        assert.deepEqual(layers[0].shapes, [[[0, 1]], [[0]]]);
      })

      it("test 2", function() {
        var arcs = new ArcCollection(coords);
        var layers = [{
          geometry_type: 'polyline',
          shapes: [[[~1, ~0]]] // cba
        }, {
          geometry_type: 'polyline',
          shapes: [[[0]]] // ab
        }];
        api.internal.dissolveArcs({layers: layers, arcs: arcs});
        assert.deepEqual(layers[0].shapes, [[[0, 1]]]);
        assert.deepEqual(layers[1].shapes, [[[~1]]]);
      })

    })

  })

  describe('getArcDissolveTest()', function () {

    //      b --- c      e
    //     / \   /      / \
    //    /   \ /      /   \
    //   a --- d      g --- h

    var coords = [
      [[1, 1], [2, 2]],  // ab
      [[2, 2], [4, 2], [3, 1]],  // bcd
      [[2, 2], [3, 1]],  // bd
      [[3, 1], [1, 1]],  // da
      [[6, 2], [7, 1], [5, 1], [6, 2]]];  // ehge

    it('shapes 1', function () {
      var dataset = {
        arcs: new api.internal.ArcCollection(coords),
        layers: [{
          geometry_type: 'polygon',
          shapes: [[[0, 2, 3]], [[1, ~2]], [[4]]]
        }]
      };
      var test = api.internal.getArcDissolveTest(dataset.layers, dataset.arcs);

      assert.equal(test(~0, ~3), true);
      assert.equal(test(3, 0), true);
      assert.equal(test(0, 2), false);
      assert.equal(test(0, ~2), false);
      assert.equal(test(4, 4), false); // edge case; shouldn't occur
      assert.equal(test(1, 2), false);
      assert.equal(test(1, 3), false);
      assert.equal(test(2, 3), false);
    })

    it('shapes 2', function () {
      var dataset = {
        arcs: new api.internal.ArcCollection(coords),
        layers: [{
          geometry_type: 'polygon',
          shapes: [[[0, 1, 3]]]
        }]
      };
      var test = api.internal.getArcDissolveTest(dataset.layers, dataset.arcs);
      assert.equal(test(0, 1), true);
      assert.equal(test(1, 3), true);
      assert.equal(test(3, 0), true);
      assert.equal(test(1, 0), false);
      assert.equal(test(~1, ~0), true);
      assert.equal(test(0, 2), false);
      assert.equal(test(1, 2), false);
      assert.equal(test(1, ~2), false);
    })

  })
})