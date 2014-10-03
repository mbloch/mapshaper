var api = require('../'),
    assert = require('assert'),
    ArcCollection = api.internal.ArcCollection;

describe('mapshaper-path-division.js', function () {
  // TODO: move to correct file
  describe('setting bits', function() {
    var setBits = api.internal.setBits,
        andBits = api.internal.andBits,
        orBits = api.internal.orBits;

    it('setBits()', function() {
      assert.equal(setBits(0, 3, 2), 2);
      assert.equal(setBits(0xff, 0, 3), 0xfc);
    });

    it('andBits()', function() {
      assert.equal(andBits(0, 3, 2), 0);
      assert.equal(andBits(0xff, 2, 3), 254);
    });

  });

  describe('Fig. 1 - two simple polygons', function () {

    //  Fig. 1
    //
    //      f ----- g
    //      |       |
    //  d --|-- a   |
    //  |   |   |   |
    //  |   e ----- h
    //  |       |
    //  c ----- b
    //
    var coords = [[[3, 3], [3, 1], [1, 1], [1, 3], [3, 3]],
        [[2, 2], [2, 4], [4, 4], [4, 2], [2, 2]]];

    var arcs = new ArcCollection(coords);
    var map = api.internal.insertClippingPoints(arcs);
    var nodes = new api.internal.NodeCollection(arcs);

    it('insert clipping points', function () {

      //
      //      f ----- g
      //      4       |
      //  d --*-2 a   |
      //  |   3   0   |
      //  |   e 5-*-- h
      //  |       1
      //  c ----- b
      //

      var result = arcs.toArray();
      var targetArcs = [[[3, 3], [3, 2]],
          [[3, 2], [3, 1], [1, 1], [1, 3], [2, 3]],
          [[2, 3], [3, 3]],
          [[2, 2], [2, 3]],
          [[2, 3], [2, 4], [4, 4], [4, 2], [3, 2]],
          [[3, 2], [2, 2]]];

      assert.deepEqual(result, targetArcs);
      assert.deepEqual(api.utils.toArray(map), [0, 3]);
    })

    it('update polygon ids', function () {
      var lyrA = {
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var lyrB = {
        geometry_type: "polygon",
        shapes: [[[1]]]
      };
      var targetA = [[[0, 1, 2]]],
          targetB = [[[3, 4, 5]]];

      api.internal.updateArcIds(lyrA.shapes, map, nodes);
      api.internal.updateArcIds(lyrB.shapes, map, nodes);
      assert.deepEqual(lyrA.shapes, targetA);
      assert.deepEqual(lyrB.shapes, targetB);
    })

    it('update ids of reversed polygons', function () {
      var lyrA = {
        geometry_type: "polygon",
        shapes: [[[~0]]]
      };
      var lyrB = {
        geometry_type: "polygon",
        shapes: [[[~1]]]
      };
      var targetA = [[[~2, ~1, ~0]]],
          targetB = [[[~5, ~4, ~3]]];

      api.internal.updateArcIds(lyrA.shapes, map, nodes);
      api.internal.updateArcIds(lyrB.shapes, map, nodes);
      assert.deepEqual(lyrA.shapes, targetA);
      assert.deepEqual(lyrB.shapes, targetB);
    })

    /*
    it('divide lyr A polygon', function () {
      var lyrA = {
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var lyrB = {
        geometry_type: "polygon",
        shapes: [[[1]]]
      };
      var target = [[[0, 5, 3, 2], [1, ~3, ~5]]];
      api.internal.updateArcIds(lyrA.shapes, map, arcs);
      api.internal.updateArcIds(lyrB.shapes, map, arcs);
      var dividedLyr = api.dividePolygonLayer(lyrA, lyrB, arcs);
      assert.deepEqual(dividedLyr.shapes, target);
    })
    */

  })

  describe('Fig. 2 polygons - point-segment (T) intersections', function () {

    //  Fig. 2
    //
    //      g ----- h
    //      |       |
    //  d - f - a   |
    //  |   |   |   |
    //  |   e - j - i
    //  |       |
    //  c ----- b
    //
    // arcs: abcda, efghije (point-segment intersections)
    var coords = [[[3, 3], [3, 1], [1, 1], [1, 3], [3, 3]],
        [[2, 2], [2, 3], [2, 4], [4, 4], [4, 2], [3, 2], [2, 2]]];


    var arcs = new ArcCollection(coords);
    var map = api.internal.insertClippingPoints(arcs);

    it('arcs are divided', function () {
      var targetArcs = [
          [[3, 3], [3, 2]],  // (0)
          [[3, 2], [3, 1], [1, 1], [1, 3], [2, 3]],
          [[2, 3], [3, 3]],
          [[2, 2], [2, 3]],  // (1)
          [[2, 3], [2, 4], [4, 4], [4, 2], [3, 2]],
          [[3, 2], [2, 2]]];

      var result = arcs.toArray();
      assert.deepEqual(result, targetArcs);
      assert.deepEqual(api.utils.toArray(map), [0, 3]);
    })
  })

  describe('Fig. 3 polygons', function () {
    //
    //  Fig. 3
    //
    //      g ----- h
    //      |       |
    //      |   j --|k
    //      |   |   ||
    //  d --|-- e --|l
    //  |   |   |   |
    //  |   f --a-- i
    //  |   |   |   |
    //  c --|-- b   |
    //      |       |
    //      n ----- m

    var coords =
        [[[3, 3], [3, 2], [1, 2], [1, 4], [3, 4], [3, 3]], // a,b,c,d,e,a
        [[2, 3], [2, 6], [4, 6], [4, 3]],                  // f,g,h,i
        [[4, 3], [2, 3]],                                  // i,f
        [[3, 5], [4, 5], [4, 4], [3, 4], [3, 5]],          // j,k,l,e,j
        [[4, 3], [4, 1], [2, 1], [2, 3]]];                 // i,m,n,f

    var arcs = new ArcCollection(coords);

    var lyrA = {
      geometry_type: "polygon",
      shapes: [[[0], [3]]]
    };
    var lyrB = {
      geometry_type: "polygon",
      shapes: [[[1, 2]], [[4, ~2]]]
    };

    var map = api.internal.insertClippingPoints(arcs);
    var nodes = new api.internal.NodeCollection(arcs);
    api.internal.updateArcIds(lyrA.shapes, map, nodes);
    api.internal.updateArcIds(lyrB.shapes, map, nodes);

    it ("divide arcs", function() {

      //      g ----- h     // showing arc ids after clipping
      //      |       |
      //      |   j 9 k
      //      4   |   5/10
      //  d - * 2 e 11l
      //  |   3   |   6
      //  |   f 8 a 7 i
      //  |  13   0   12
      //  c 1 * - b   |
      //      |       |
      //      n ----- m
      //
      var coords = arcs.toArray();
      var target = [
        [[3, 3], [3, 2], [2, 2]],         // ab.  (0)
        [[2, 2], [1, 2], [1, 4], [2, 4]], // .cd.
        [[2, 4], [3, 4], [3, 3]],         // .ea
        [[2, 3], [2, 4]],                 // f.   (1)
        [[2, 4], [2, 6], [4, 6], [4, 5]], // .ghk
        [[4, 5], [4, 4]],                 // kl
        [[4, 4], [4, 3]],                 // li
        [[4, 3], [3, 3]],                 // ia   (2)
        [[3, 3], [2, 3]],                 // af
        [[3, 5], [4, 5]],                 // jk   (3)
        [[4, 5], [4, 4]],                 // kl  // duplicate
        [[4, 4], [3, 4], [3, 5]],         // lej
        [[4, 3], [4, 1], [2, 1], [2, 2]], // imn. (4)
        [[2, 2], [2, 3]]];                // .f

      assert.deepEqual(coords, target);
      assert.deepEqual(api.utils.toArray(map), [0, 3, 7, 9, 12])
    })

    it ("layer A remapped", function() {
      var targetA = [[[0, 1, 2], [9, 5, 11]]];
      assert.deepEqual(lyrA.shapes, targetA);
    })

    it ("layer B remapped", function() {
      var targetB = [[[3, 4, 5, 6, 7, 8]], [[12, 13, ~8, ~7]]];
      assert.deepEqual(lyrB.shapes, targetB);
    })
    /*
    it ("divide layer A", function() {
      var dividedLyr = api.dividePolygonLayer(lyrA, lyrB, arcs);
      var target = [[[0, 13, ~8], [1, ~3, ~13], [2, 8, 3], [9, 5, 11]]];
      // [9, 5, 11] used instead of [9, 10, 11];
      assert.deepEqual(dividedLyr.shapes, target);
    })
    */

  })

})
