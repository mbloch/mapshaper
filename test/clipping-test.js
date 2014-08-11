var api = require('../'),
    assert = require('assert'),
    ArcCollection = api.internal.ArcCollection;

// return;
describe('mapshaper-clip-erase.js', function () {
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

  describe('Fig. 4 - Arc with spike', function () {

    // Fig 4 -- edge case
    //
    //       a ----- b
    //       |       |
    //   j --*-- e --*-- g
    //   |   |   |   |   |
    //   |   |   f   |   |
    //   |   |       |   |
    //   |   d ----- c   |
    //   |               |
    //   i ------------- h
    //
    // arc0: abcda
    // arc1: efeghije
    //
    var coords = [[[2, 5], [4, 5], [4, 2], [2, 2], [2, 5]],
        [[3, 4], [3, 3], [3, 4], [5, 4], [5, 1], [1, 1], [1, 4], [3, 4]]];

    it('Divide arcs', function() {
      var arcs = new ArcCollection(coords);
      var target = [[[2, 5], [4, 5], [4, 4]],
          [[4, 4], [4, 2], [2, 2], [2, 4]],
          [[2, 4], [2, 5]],
          [[3, 4], [3, 3], [3, 4], [4, 4]],
          [[4, 4], [5, 4], [5, 1], [1, 1], [1, 4], [2, 4]],
          [[2, 4], [3, 4]]];

      var map = api.internal.insertClippingPoints(arcs);
      assert.deepEqual(arcs.toArray(), target);
      assert.deepEqual(api.utils.toArray(map), [0, 3]);
    })

    it('Clip', function () {

      var lyr1 = {
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var lyr2 = {
        geometry_type: "polygon",
        shapes: [[[1]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };
      var targetShapes = [[[1, 5, 3]]];
      // var targetShapes = [[[1, 6, 4]]];  // spike is cut off and ignored
      var clippedLyr = api.clipPolygons(lyr1, lyr2, dataset);
      assert.deepEqual(clippedLyr.shapes, targetShapes);
    })
  })

  describe('Fig. 5 - polygon with hole', function () {
    //
    //  a ----------------- b
    //  |                   |
    //  |   i ----- j       |
    //  |   |       |       |
    //  |   |   e --*-- f   |
    //  |   |   |   |   |   |
    //  |   |   h --*-- g   |
    //  |   |       |       |
    //  |   l ----- k       |
    //  |                   |
    //  d ----------------- c
    //
    var coords = [[[1, 6], [6, 6], [6, 1], [1, 1], [1, 6]],
          [[3, 4], [5, 4], [5, 3], [3, 3], [3, 4]],
          [[2, 5], [4, 5], [4, 2], [2, 2] ,[2, 5]]];

    it ("Divide arcs", function() {
      var arcs = new ArcCollection(coords);
      var target = [[[1, 6], [6, 6], [6, 1], [1, 1], [1, 6]], // 0
          [[3, 4], [4, 4]],  // 1
          [[4, 4], [5, 4], [5, 3], [4, 3]],
          [[4, 3], [3, 3], [3, 4]],
          [[2, 5], [4, 5], [4, 4]],  // 4
          [[4, 4], [4, 3]],
          [[4, 3], [4, 2], [2, 2], [2, 5]]];

      var map = api.internal.insertClippingPoints(arcs);

      assert.deepEqual(arcs.toArray(), target);
      assert.deepEqual(api.utils.toArray(map), [0, 1, 4])
    })

    it ("Clip test 1", function() {
      // use simple polygon to clip layer with filled hole
      var lyr1 = {
        geometry_type: "polygon",
        shapes: [[[0], [~1]], [[1]]]
      };
      var lyr2 = {
        geometry_type: "polygon",
        shapes: [[[2]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clippedLyr = api.clipPolygons(lyr1, lyr2, dataset);
      var target = [
        [[~3, 6, 4, ~1]],
        [[1, 5, 3]]];

      assert.deepEqual(clippedLyr.shapes, target);
    })

    it ("Clip test 2", function() {
      // use layer with hole to clip simple polygon
      var lyr1 = {
        geometry_type: "polygon",
        shapes: [[[0], [~1]]]
      };
      var lyr2 = {
        geometry_type: "polygon",
        shapes: [[[2]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clippedLyr = api.clipPolygons(lyr2, lyr1, dataset);
      var target = [[[4, ~1, ~3, 6]]];

      assert.deepEqual(clippedLyr.shapes, target);
    })

    it ("Erase test 1", function() {
      // use simple polygon to erase polygon with hole
      var lyr1 = {
        geometry_type: "polygon",
        shapes: [[[0], [~1]]]
      };
      var lyr2 = {
        geometry_type: "polygon",
        shapes: [[[2]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var erasedLyr = api.erasePolygons(lyr1, lyr2, dataset);
      var target = [[[0], [~2, ~4, ~6]]];

      assert.deepEqual(erasedLyr.shapes, target);

    });
  })

  describe('Fig. 6 - polygon with hole', function () {
    //
    //  a ------------- b
    //  |               |
    //  |   e ----- f   |
    //  |   |       |   |
    //  |   |   i --*---*-- j
    //  |   |   |   |   |   |
    //  |   |   l --*---*-- k
    //  |   |       |   |
    //  |   h ----- g   |
    //  |               |
    //  d ------------- c
    //
    var coords = [[[1, 6], [5, 6], [5, 1], [1, 1], [1, 6]],
          [[2, 5], [4, 5], [4, 2], [2, 2] ,[2, 5]],
          [[3, 4], [6, 4], [6, 3], [3, 3], [3, 4]]];

    it ("Divide arcs", function() {
      var arcs = new ArcCollection(coords);

      var target = [
          [[1, 6], [5, 6], [5, 4]],         // 0
          [[5, 4], [5, 3]],
          [[5, 3], [5, 1], [1, 1], [1, 6]],

          [[2, 5], [4, 5], [4, 4]],         // 3
          [[4, 4], [4, 3]],
          [[4, 3], [4, 2], [2, 2], [2, 5]],

          [[3, 4], [4, 4]],                 // 6
          [[4, 4], [5, 4]],
          [[5, 4], [6, 4], [6, 3], [5, 3]],
          [[5, 3], [4, 3]],
          [[4, 3], [3, 3], [3, 4]]];

      var map = api.internal.insertClippingPoints(arcs);
      assert.deepEqual(arcs.toArray(), target);
      assert.deepEqual(api.utils.toArray(map), [0, 3, 6]);
    })


    it ("Clip test 1", function() {
      // use simple polygon to clip layer with filled hole
      var lyr1 = {
        geometry_type: "polygon",
        shapes: [[[0], [~1]], [[1]]]
      };
      var lyr2 = {
        geometry_type: "polygon",
        shapes: [[[2]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clippedLyr = api.clipPolygons(lyr1, lyr2, dataset);
      var target = [
        [[1, 9, ~4, 7]],
        [[4, 10, 6]]];

      assert.deepEqual(clippedLyr.shapes, target);
    })

    it ("Clip test 2", function() {
      // use layer with hole to clip simple polygon
      var lyr1 = {
        geometry_type: "polygon",
        shapes: [[[0], [~1]]]
      };
      var lyr2 = {
        geometry_type: "polygon",
        shapes: [[[2]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clippedLyr = api.clipPolygons(lyr2, lyr1, dataset);
      var target = [[[7, 1, 9, ~4]]];

      assert.deepEqual(clippedLyr.shapes, target);
    })


    it ("Erase test 1", function() {
      // use polygon with hole to erase simple polygon
      var lyr1 = {
        geometry_type: "polygon",
        shapes: [[[0], [~1]]]
      };
      var lyr2 = {
        geometry_type: "polygon",
        shapes: [[[2]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var erasedLyr = api.erasePolygons(lyr2, lyr1, dataset);
      var target = [[[6, 4, 10], [8, ~1]]];

      assert.deepEqual(erasedLyr.shapes, target);
    })

    it ("Erase test 2", function() {
      // use polygon with hole to erase simple polygon
      var lyr1 = {
        geometry_type: "polygon",
        shapes: [[[0], [~1]], [[1]]]
      };
      var lyr2 = {
        geometry_type: "polygon",
        shapes: [[[2]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var erasedLyr = api.erasePolygons(lyr1, lyr2, dataset);
      var target = [
        [[0, ~7, ~3, ~5, ~9, 2]],
        [[3, ~6, ~10, 5]]];

      assert.deepEqual(erasedLyr.shapes, target);
    })

  })

  describe('Fig 7 - ring inside ring', function () {
    //
    //  a --------- b
    //  |           |
    //  |   e - f   |
    //  |   |   |   |
    //  |   h - g   |
    //  |           |
    //  d --------- c
    //
    var coords = [[[1, 4], [4, 4], [4, 1], [1, 1], [1, 4]],  // abcda
          [[2, 3], [3, 3], [3, 2], [2, 2], [2, 3]]];         // efghe

    it('Divide arcs', function () {
      var target = JSON.parse(JSON.stringify(coords));
      var arcs = new ArcCollection(coords);

      var map = api.internal.insertClippingPoints(arcs);
      assert.deepEqual(arcs.toArray(), target);
      assert.deepEqual(api.utils.toArray(map), [0, 1]);
    })

    it ('Clip outer with inner', function() {
      var lyr1 = {
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var lyr2 = {
        geometry_type: "polygon",
        shapes: [[[1]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clippedLyr = api.clipPolygons(lyr1, lyr2, dataset);
      var target = [[[1]]];

      assert.deepEqual(clippedLyr.shapes, target);
    });

    it ('Clip inner with outer', function() {
      var lyr1 = {
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var lyr2 = {
        geometry_type: "polygon",
        shapes: [[[1]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clippedLyr = api.clipPolygons(lyr2, lyr1, dataset);
      var target = [[[1]]];

      assert.deepEqual(clippedLyr.shapes, target);
    });

    it ('Erase outer with inner', function() {
      var lyr1 = {
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var lyr2 = {
        geometry_type: "polygon",
        shapes: [[[1]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clippedLyr = api.erasePolygons(lyr1, lyr2, dataset);
      var target = [[[0], [~1]]];

      assert.deepEqual(clippedLyr.shapes, target);
    });

    it ('Erase inner with outer', function() {
      var lyr1 = {
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var lyr2 = {
        geometry_type: "polygon",
        shapes: [[[1]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clippedLyr = api.erasePolygons(lyr2, lyr1, dataset);
      var target = [null];

      assert.deepEqual(clippedLyr.shapes, target);
    });

    it ('Erase filled donut with itself', function() {
      var lyr1 = {
        name: "layer1",
        geometry_type: "polygon",
        shapes: [[[0], [~1]], [[1]]]
      };
      var lyr2 = {
        name: "layer2",
        geometry_type: "polygon",
        shapes: [[[0], [~1]], [[1]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clippedLyr = api.erasePolygons(lyr2, lyr1, dataset);
      var target = [null, null];

      assert.deepEqual(clippedLyr.shapes, target);
    });

    it ('Clip filled donut with itself', function() {
      var lyr1 = {
        name: "layer1",
        geometry_type: "polygon",
        shapes: [[[0], [~1]], [[1]]]
      };
      var lyr2 = {
        name: "layer2",
        geometry_type: "polygon",
        shapes: [[[0], [~1]], [[1]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clippedLyr = api.clipPolygons(lyr2, lyr1, dataset);
      var target = [[[0], [~1]], [[1]]];

      assert.deepEqual(clippedLyr.shapes, target);
    });

  })

  describe('Fig 8 - adjacent polygons inside polygon', function () {
    //
    //  a ----------- b
    //  |             |
    //  |  h - e - i  |
    //  |  |   |   |  |
    //  |  g - f - j  |
    //  |             |
    //  d ----------- c
    //
    var coords = [[[1, 4], [5, 4], [5, 1], [1, 1], [1, 4]], // abcda
          [[3, 3], [3, 2]],  // ef
          [[3, 2], [2, 2], [2, 3], [3, 3]],  // fghe
          [[3, 3], [4, 3], [4, 2], [3, 2]]]; // eijf

    it ("clip inner with outer", function() {
      var lyr1 = {
        name: "layer1",
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var lyr2 = {
        name: "layer2",
        geometry_type: "polygon",
        shapes: [[[1, 2]], [[3, ~1]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clippedLyr = api.clipPolygons(lyr2, lyr1, dataset);
      var target = [[[1, 2]], [[3, ~1]]];
      assert.deepEqual(clippedLyr.shapes, target);
    })

    it ("clip outer with inner", function() {
      var lyr1 = {
        name: "layer1",
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var lyr2 = {
        name: "layer2",
        geometry_type: "polygon",
        shapes: [[[1, 2]], [[3, ~1]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clippedLyr = api.clipPolygons(lyr1, lyr2, dataset);
      var target = [[[2, 3]]];
      assert.deepEqual(clippedLyr.shapes, target);
    })

    it ("erase inner with outer", function() {
      var lyr1 = {
        name: "layer1",
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var lyr2 = {
        name: "layer2",
        geometry_type: "polygon",
        shapes: [[[1, 2]], [[3, ~1]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var erasedLyr = api.erasePolygons(lyr2, lyr1, dataset);
      var target = [null, null];
      assert.deepEqual(erasedLyr.shapes, target);
    })

    it ("erase outer with inner", function() {
      var lyr1 = {
        name: "layer1",
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var lyr2 = {
        name: "layer2",
        geometry_type: "polygon",
        shapes: [[[1, 2]], [[3, ~1]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var erasedLyr = api.erasePolygons(lyr1, lyr2, dataset);
      //var target = [[[0], [~2, ~3]]];
      var target = [[[0], [~3, ~2]]];
      assert.deepEqual(erasedLyr.shapes, target);
    })
  })

  describe('Fig 10 - congruent rings', function () {
    //
    //  a --- b
    //  |     |
    //  |     |
    //  d --- c
    //
    var coords = [[[1, 2], [2, 2], [2, 1], [1, 1], [1, 2]], // abcda
        [[1, 2], [2, 2], [2, 1], [1, 1], [1, 2]]];          // abcda

    it ("clip ring with itself", function() {
      var lyr1 = {
        name: "layer1",
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var lyr2 = {
        name: "layer2",
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clippedLyr = api.clipPolygons(lyr2, lyr1, dataset);
      var target = [[[0]]];
      assert.deepEqual(clippedLyr.shapes, target);
    })

    it ("erase ring with itself", function() {
      var lyr1 = {
        name: "layer1",
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var lyr2 = {
        name: "layer2",
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var erasedLyr = api.erasePolygons(lyr2, lyr1, dataset);
      var target = [null];
      assert.deepEqual(erasedLyr.shapes, target);
    })

    it ("erase ring with duplicate ring", function() {
      var lyr1 = {
        name: "layer1",
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var lyr2 = {
        name: "layer2",
        geometry_type: "polygon",
        shapes: [[[1]]] // different arc id, identical coords
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var erasedLyr = api.erasePolygons(lyr2, lyr1, dataset);
      var target = [null];
      assert.deepEqual(erasedLyr.shapes, target);
    })
  })


  describe('Fig 11 - adjacent rings', function () {
    //
    //  d --- a --- e
    //  |     |     |
    //  |     |     |
    //  c --- b --- f
    //
    var coords = [[[2, 2], [2, 1]],  // ab
        [[2, 1], [1, 1], [1, 2], [2, 2]],  // bcda
        [[2, 2], [3, 2], [3, 1], [2, 1]]]; // aefb

    it ("clip target ring with adjacent ring", function() {
      var lyr1 = {
        name: "layer1",
        geometry_type: "polygon",
        shapes: [[[0, 1]]]
      };
      var lyr2 = {
        name: "layer2",
        geometry_type: "polygon",
        shapes: [[[2, ~0]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clippedLyr = api.clipPolygons(lyr2, lyr1, dataset);
      var target = [null];
      assert.deepEqual(clippedLyr.shapes, target);
    })


   it ("erase target ring with adjacent ring", function() {
      var lyr1 = {
        name: "layer1",
        geometry_type: "polygon",
        shapes: [[[0, 1]]]
      };
      var lyr2 = {
        name: "layer2",
        geometry_type: "polygon",
        shapes: [[[2, ~0]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clippedLyr = api.erasePolygons(lyr2, lyr1, dataset);
      var target = [[[2, ~0]]];
      assert.deepEqual(clippedLyr.shapes, target);
    })

   it ("clip target ring with overlapping ring", function() {
      var lyr1 = {
        name: "clip",
        geometry_type: "polygon",
        shapes: [[[2, 1]]]
      };
      var lyr2 = {
        name: "target",
        geometry_type: "polygon",
        shapes: [[[2, ~0]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clippedLyr = api.clipPolygons(lyr2, lyr1, dataset);
      var target = [[[2, ~0]]];
      assert.deepEqual(clippedLyr.shapes, target);
    })

   it ("clip target ring with inset ring", function() {
      var lyr1 = {
        name: "target",
        geometry_type: "polygon",
        shapes: [[[1, 2]]]
      };
      var lyr2 = {
        name: "clip",
        geometry_type: "polygon",
        shapes: [[[2, ~0]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clippedLyr = api.clipPolygons(lyr1, lyr2, dataset);
      var target = [[[2, ~0]]];
      assert.deepEqual(clippedLyr.shapes, target);
    })

   it ("erase target ring with inset ring", function() {
      var lyr1 = {
        name: "target",
        geometry_type: "polygon",
        shapes: [[[1, 2]]]
      };
      var lyr2 = {
        name: "erase",
        geometry_type: "polygon",
        shapes: [[[2, ~0]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clippedLyr = api.erasePolygons(lyr1, lyr2, dataset);
      var target = [[[1, 0]]];
      assert.deepEqual(clippedLyr.shapes, target);
    })

   it ("erase target ring with overlapping ring", function() {
      var lyr1 = {
        name: "erase",
        geometry_type: "polygon",
        shapes: [[[1, 2]]]
      };
      var lyr2 = {
        name: "target",
        geometry_type: "polygon",
        shapes: [[[2, ~0]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clippedLyr = api.erasePolygons(lyr2, lyr1, dataset);
      var target = [null];
      assert.deepEqual(clippedLyr.shapes, target);
    })
  })

  describe('Fig 12 - adjacent polygons inside polygon', function () {
    //
    //  a ----------- b
    //  |             |
    //  |  h - e - i  |
    //  |  |   |   |  |
    //  |  g - f - j  |
    //  |             |
    //  d ----------- c
    //
    var coords = [[[1, 4], [5, 4], [5, 1], [1, 1], [1, 4]], // abcda
          [[3, 3], [3, 2]],  // ef
          [[3, 2], [2, 2], [2, 3], [3, 3]],  // fghe
          [[3, 3], [4, 3], [4, 2], [3, 2]]]; // eijf

    it ("erase a partially congruent polygon", function() {
      var lyr1 = {
        name: "layer1",
        geometry_type: "polygon",
        shapes: [[[2, 3]]]
      };
      var lyr2 = {
        name: "layer2",
        geometry_type: "polygon",
        shapes: [[[1, 2]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var erasedLyr = api.erasePolygons(lyr1, lyr2, dataset);
      var target = [[[3, ~1]]];
      assert.deepEqual(erasedLyr.shapes, target);
    })
  })

  describe('Fig xx - polygon with self-intersection', function () {
    //
    //  Goal: convert the triangle into a separate part ?
    //        or maybe thread the path through the intersection point
    //
    //  a ---- b
    //  |      |
    //  |  h --|-- i
    //  |  |   |   |
    //  |  g --|---|-- k
    //  |      |   | /
    //  d ---- c   j
    //

  })

  describe('Fig xx - polygon with self-intersection', function() {
    //
    //  Goal: remove the inner triangle, or at least don't block
    //
    //  h --------------- i
    //  |                 |
    //  |  e --------- f  |
    //  |  |           |  |
    //  |  |   b - c   |  |
    //  |  |   | /     |  |
    //  |  |   /       |  |
    //  |  | / |       |  |
    //  |  d   a ----- g  |
    //  |                 |
    //  k --------------- j
    //
    var coords = [[[3, 2], [3, 4], [4, 4], [2, 2], [2, 5], [5, 5], [5, 2], [3, 2]],  // abcdefga
            [[1, 6], [6, 6], [6, 1], [1, 1], [1, 6]]];  // hijkh

    it ("CW self-intersection in target layer doesn't block", function() {

      var clipLyr = {
        name: "clip",
        geometry_type: "polygon",
        shapes: [[[1]]]
      };
      var targetLyr = {
        name: "target",
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [clipLyr, targetLyr]
      };

      var clippedLyr = api.clipPolygons(targetLyr, clipLyr, dataset);
      var target = [[[2, 0]]];
      assert.deepEqual(clippedLyr.shapes, target);
    });

  })


  describe('Bugfix ## - interior ring touches clip shape at one point', function () {
    //
    //  d -- e -- a
    //  |   / \   |
    //  |  g - f  |
    //  |         |
    //  c ------- b
    //
    //   abcde, efge, ea
    //   0,     1,    2

    var coords = [[[5, 3], [5, 1], [1, 1], [1, 3], [3, 3]],
        [[3, 3], [4, 2], [2, 2], [3, 3]],
        [[3, 3], [5, 3]]];

    it('erasing against containing ring should make inner ring disappear', function () {
      var clipLyr = {
        name: "clip",
        geometry_type: "polygon",
        shapes: [[[0, 2]]]
      };
      var targetLyr = {
        name: "target",
        geometry_type: "polygon",
        shapes: [[[1]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [clipLyr, targetLyr]
      };

      var erasedLyr = api.erasePolygons(targetLyr, clipLyr, dataset);
      var target = [null];
      assert.deepEqual(erasedLyr.shapes, target);
    })
  })

  describe('Bugfix ## - island clip/erase self', function() {
    // Source: an island from ne_10m_admin_0_countries.shp that doesn't erase self
    var coords = [ [ [ -114.31688391799986, 78.01422760600012 ],
    [ -114.25780188699993, 77.98944733300006 ],
    [ -114.11461341099997, 78.00043366100012 ],
    [ -114.06362870999996, 77.97264232000005 ],
    [ -114.06989498599991, 77.97264232000005 ],
    [ -113.9874161449999, 77.93744538000009 ],
    [ -113.97427324099993, 77.92829010600012 ],
    [ -113.95132402299996, 77.9188500020001 ],
    [ -113.7372940749999, 77.90167877800006 ],
    [ -113.70152747299996, 77.89036692900008 ],
    [ -113.6862686839999, 77.86660390800007 ],
    [ -113.67149817599991, 77.84593333500008 ],
    [ -113.60094153599994, 77.8324242210001 ],
    [ -113.57701575399997, 77.81500885600012 ],
    [ -113.60423743399988, 77.81085846600008 ],
    [ -113.72248287699992, 77.76923248900012 ],
    [ -114.16258704299987, 77.70673248900009 ],
    [ -114.3006892569999, 77.71328359600007 ],
    [ -114.4796036449999, 77.75141022300004 ],
    [ -114.6213272779999, 77.75682200700008 ],
    [ -114.65269934799994, 77.76788971600011 ],
    [ -114.62287350199993, 77.77411530200008 ],
    [ -114.51610266799986, 77.76044342700006 ],
    [ -114.5379939439999, 77.78302643400012 ],
    [ -114.58193925699992, 77.79645416900011 ],
    [ -114.66698157499994, 77.80817291900011 ],
    [ -114.79824785099996, 77.85032786700005 ],
    [ -114.85781816299988, 77.85980866100006 ],
    [ -115.1182348299999, 77.95966217700006 ],
    [ -115.0970759759999, 77.96613190300015 ],
    [ -115.06932532499992, 77.96893952000009 ],
    [ -115.04067949099995, 77.96824778900007 ],
    [ -114.99071204299992, 77.95799388200005 ],
    [ -114.9683324859999, 77.95677317900002 ],
    [ -114.94762122299989, 77.95966217700006 ],
    [ -114.89891516799986, 77.97357819200003 ],
    [ -114.7950740229999, 77.98285553600009 ],
    [ -114.76732337099992, 77.99005768400012 ],
    [ -114.74111894399988, 77.99994538000003 ],
    [ -114.6796768869999, 78.03449127800012 ],
    [ -114.50186113199995, 78.04840729400011 ],
    [ -114.38882402299991, 78.07660553600009 ],
    [ -114.32725989499995, 78.08079661700002 ],
    [ -114.28278561099985, 78.06207916900014 ],
    [ -114.2938533189999, 78.05231354400011 ],
    [ -114.35098222599987, 78.03473541900009 ],
    [ -114.33193925699987, 78.02741120000006 ],
    [ -114.26911373599991, 78.01422760600012 ],
    [ -114.31688391799986, 78.01422760600012 ] ] ];

    it ("Island polygon should erase itself", function() {

      var clipLyr = {
        name: "clip",
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var targetLyr = {
        name: "target",
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [clipLyr, targetLyr]
      };

      var clippedLyr = api.erasePolygons(targetLyr, clipLyr, dataset);
      var target = [null];
      assert.deepEqual(clippedLyr.shapes, target);
    });

    it ("Self-clip retains island", function() {

      var clipLyr = {
        name: "clip",
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var targetLyr = {
        name: "target",
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [clipLyr, targetLyr]
      };

      var clippedLyr = api.clipPolygons(targetLyr, clipLyr, dataset);
      var target = [[[0]]];
      assert.deepEqual(clippedLyr.shapes, target);
    });

  })


})
