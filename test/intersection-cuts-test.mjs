import api from '../mapshaper.js';
import assert from 'assert';

var ArcCollection = api.internal.ArcCollection;

describe('mapshaper-intersection-cuts.js', function () {

  describe('insertCutPoints()', function () {
    var insertCutPoints = api.internal.insertCutPoints;
    it('skip point at start of an arc', function () {
      var arcs = new ArcCollection([[[0, 0], [1, 0]]]);
      var points = [{x: 0, y: 0, i: 0}];
      var map = insertCutPoints(points, arcs);
      assert.deepEqual(arcs.toArray(), [[[0, 0], [1, 0]]]);
    })

    it('skip point at end of an arc', function () {
      var arcs = new ArcCollection([[[0, 0], [1, 0]]]);
      var points = [{x: 1, y: 0, i: 1}];
      var map = insertCutPoints(points, arcs);
      assert.deepEqual(arcs.toArray(), [[[0, 0], [1, 0]]]);
    })
  })

  describe('getCutPoint()', function () {
    var getCutPoint = api.internal.getCutPoint;
    var xx = [0, 0, 1, 1, 2];
    var yy = [0, 0, 1, 2, 2];

    // it('out-of-range cut point-> null', function() {
    it('out-of-range cut point-> tolerated', function() {
      assert.deepEqual(getCutPoint(-1e-20, 0, 1, 2, xx, yy), {
        x: -1e-20,
        y: 0,
        i: 1
      })
    })

    it('out-of-sequence arc ids -> error', function() {
      assert.throws(function() {
        getCutPoint(0.5, 0.5, 1, 3, xx, yy);
      })
      assert.throws(function() {
        getCutPoint(0.5, 0.5, 2, 1, xx, yy);
      })
    })

    it('midpoint', function() {
      assert.deepEqual(getCutPoint(0.5, 0.5, 1, 2, xx, yy), {x: 0.5, y: 0.5, i: 1});
      assert.deepEqual(getCutPoint(1, 1.5, 2, 3, xx, yy), {x: 1, y: 1.5, i: 2});
    })
  })

  describe('filterSortedCutPoints()', function () {
    var arcs = new ArcCollection([[[0,1], [1, 1], [2, 1]]]);
    it('remove duplicates from sorted points', function () {

      var points = [
        {x: 0, y: 1, i: 0}, {x: 0, y: 1, i: 0},
        {x: 1, y: 1, i: 1}, {x: 1, y: 1, i: 1},
        {x: 2, y: 1, i: 2}
        ];
      assert.deepEqual(api.internal.filterSortedCutPoints(points, arcs),
        [{x: 1, y: 1, i: 1}]);

    })
  });

  describe('sortCutPoints()', function () {
    it('different ids', function () {
      var points = [{x: 0, y: 0, i: 1}, {x: 1, y: 1, i: 2}, {x: 4, y: 3, i: 0}];
      api.internal.sortCutPoints(points);
      assert.deepEqual(points, [{x: 4, y: 3, i: 0}, {x: 0, y: 0, i: 1}, {x: 1, y: 1, i: 2}])
    })

    it('same ids', function () {
      var xx = [0, 1],
          yy = [0, 1];
      var points = [{x: 0.2, y: 0.2, i: 0, }, {x: 0.1, y: 0.1, i: 0}];
      api.internal.sortCutPoints(points, xx, yy);
      assert.deepEqual(points, [{x: 0.1, y: 0.1, i: 0}, {x: 0.2, y: 0.2, i: 0, }])
    })

    it('same ids2', function() {
      var xx = [1, 0],
          yy = [1, 0];
      var points = [{x: 0.2, y: 0.2, i: 0, }, {x: 0.1, y: 0.1, i: 0}];
      api.internal.sortCutPoints(points, xx, yy);
      assert.deepEqual(points, [{x: 0.2, y: 0.2, i: 0, }, {x: 0.1, y: 0.1, i: 0}])

    })
  })

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

      var arcs = new ArcCollection(coords);
      var targetArcs = [[[3, 3], [3, 2]],
          [[3, 2], [3, 1], [1, 1], [1, 3], [2, 3]],
          [[2, 3], [3, 3]],
          [[2, 2], [2, 3]],
          [[2, 3], [2, 4], [4, 4], [4, 2], [3, 2]],
          [[3, 2], [2, 2]]];

      var map = api.internal.divideArcs(arcs);
      assert.deepEqual(arcs.toArray(), targetArcs);
      assert.deepEqual(api.utils.toArray(map), [0, 3]);
    })

    it('update polygon ids', function () {
      var arcs = new ArcCollection(coords);
      var lyrA = {
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var lyrB = {
        geometry_type: "polygon",
        shapes: [[[1]]]
      };
      var dataset = {arcs: arcs, layers: [lyrA, lyrB]};
      var targetA = [[[0, 1, 2]]],
          targetB = [[[3, 4, 5]]];

      api.internal.cutPathsAtIntersections(dataset);
      assert.deepEqual(lyrA.shapes, targetA);
      assert.deepEqual(lyrB.shapes, targetB);
    })
    it('update ids of reversed polygons', function () {
      var arcs = new ArcCollection(coords);
      var lyrA = {
        geometry_type: "polygon",
        shapes: [[[~0]]]
      };
      var lyrB = {
        geometry_type: "polygon",
        shapes: [[[~1]]]
      };
      var dataset = {arcs: arcs, layers: [lyrA, lyrB]};
      var targetA = [[[~2, ~1, ~0]]],
          targetB = [[[~5, ~4, ~3]]];

      api.internal.cutPathsAtIntersections(dataset);
      assert.deepEqual(lyrA.shapes, targetA);
      assert.deepEqual(lyrB.shapes, targetB);
    })

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

    it('arcs are divided', function () {
      var arcs = new ArcCollection(coords);
      var map = api.internal.divideArcs(arcs);
      var targetArcs = [
          [[3, 3], [3, 2]],  // (0)
          [[3, 2], [3, 1], [1, 1], [1, 3], [2, 3]],
          [[2, 3], [3, 3]],
          [[2, 2], [2, 3]],  // (1)
          [[2, 3], [2, 4], [4, 4], [4, 2], [3, 2]],
          [[3, 2], [2, 2]]];

      // UPDATE: duplicate points are no longer removed by divideArcs()
      var targetArcs2 = [
        [ [ 3, 3 ], [ 3, 2 ] ],
        [ [ 3, 2 ], [ 3, 1 ], [ 1, 1 ], [ 1, 3 ], [ 2, 3 ] ],
        [ [ 2, 3 ], [ 3, 3 ] ],
        [ [ 2, 2 ], [ 2, 3 ], [ 2, 3 ] ],
        [ [ 2, 3 ], [ 2, 4 ], [ 4, 4 ], [ 4, 2 ], [ 3, 2 ], [ 3, 2 ] ],
        [ [ 3, 2 ], [ 2, 2 ] ]
      ];

      var result = arcs.toArray();
      assert.deepEqual(arcs.toArray(), targetArcs2);
      arcs.dedupCoords();
      assert.deepEqual(arcs.toArray(), targetArcs);
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
    var dataset = {arcs: arcs, layers: [lyrA, lyrB]};

    api.internal.cutPathsAtIntersections(dataset);
    dataset.arcs.dedupCoords();

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
      // assert.deepEqual(api.utils.toArray(map), [0, 3, 7, 9, 12])
    })

    it ("layer A remapped", function() {
      var targetA = [[[0, 1, 2], [9, 10, 11]]];
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
