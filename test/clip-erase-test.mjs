import api from '../mapshaper.js';
import assert from 'assert';
var ArcCollection = api.internal.ArcCollection;

describe('mapshaper-clip-erase.js', function () {

  describe('getClipMessage()', function () {
    it('test', function () {
      assert.equal(api.internal.getClipMessage(0, 1), 'Removed 1 sliver');
      assert.equal(api.internal.getClipMessage(1, 0), 'Removed 1 null feature');
      assert.equal(api.internal.getClipMessage(2, 20), 'Removed 2 null features and 20 slivers');
      assert.equal(api.internal.getClipMessage(0, 0), '');
    })
  })

  describe('bbox option', function() {
    it('Clip a point layer with a bbox', function() {
      var points = [[[0, 0]],
        null,
        [[0, 2]],
        [[2, 2]],
        [[1, 1]],
        [[2, 0]]];
      var data = [{id: 1}, {id: 2}, {id: 3}, {id: 4}, {id: 5}, {id: 6}];
      var dataset = {
        layers: [{
          geometry_type: 'point',
          shapes: points,
          data: new api.internal.DataTable(data)
        }]
      };
      var bbox = [0.5, 0.5, 1.5, 1.5];
      var output = api.cmd.clipLayers(dataset.layers, null, dataset, {bbox: bbox});
      assert.deepEqual(output[0].shapes, [[[1, 1]]]);
      assert.deepEqual(output[0].data.getRecords(), [{id: 5}])
    });

    it('Clip a polyline layer with a bbox', function(done) {
      var input = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'LineString',
          coordinates: [[0, 1], [5, 1]]
        }]
      }
      var output = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'LineString',
          coordinates: [[1, 1], [2, 1]]
        }]
      }
      api.applyCommands('-i input.json -clip bbox=1,0,2,2 -o output.json',
          {'input.json': input}, function(err, out) {
        var json = JSON.parse(out['output.json']);
        assert.deepEqual(json, output);
        done();
      });
    })

    it('Throws UserError on invalid bbox', function(done) {
      var input = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'LineString',
          coordinates: [[0, 1], [5, 1]]
        }]
      }
      api.applyCommands('-clip bbox=1,0,1,2', input, function(err, data) {
        assert.equal(err.name, 'UserError');
        done();
      });
    })

    it('No error when clipping an empty layer', function() {
      var dataset = {
        layers: [{
          geometry_type: 'polygon',
          shapes: []
        }]
      };
      var output = api.cmd.clipLayers(dataset.layers, null, dataset, {bbox: [0, 0, 1, 1]});

    });
  });

  describe('Issue #68', function () {
    it('Cell along inside edge of clip shape is retained', function (done) {
      var cmd = '-i test/data/issues/68/cell1.shp -clip test/data/issues/68/clipper.shp';
      api.internal.testCommands(cmd, function(err, data) {
        assert.equal(err, null);
        var shapes = data.layers[0].shapes;
        var area = api.geom.getPlanarShapeArea(shapes[0], data.arcs);
        assert.ok(area > 0); // got a polygon
        done();
      });
    });
  });

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
      var target = [[[2, 5], [4, 5], [4, 4]], // 0: ab*
          [[4, 4], [4, 2], [2, 2], [2, 4]],   // 1: *cd*
          [[2, 4], [2, 5]],                   // 2: *a
          [[3, 4], [3, 3], [3, 4], [4, 4]],   // 3: efe*
          [[4, 4], [5, 4], [5, 1], [1, 1], [1, 4], [2, 4]], // 4: *ghij*
          [[2, 4], [3, 4]]];                  // 5: *e

      var map = api.internal.divideArcs(arcs);
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
      var clippedLyr = api.cmd.clipLayer(lyr1, lyr2, dataset);

      if (false) {
        // Older version of snap/cut created this output:
        assert.deepEqual(clippedLyr.shapes, [[[1, 5, 3]]]);

      } else {
        // After recent update to snap/cut function, output changed:
        var targetArcs = [
          [ [ 2, 5 ], [ 4, 5 ], [ 4, 4 ] ],
          [ [ 4, 4 ], [ 4, 2 ], [ 2, 2 ], [ 2, 4 ] ],
          [ [ 2, 4 ], [ 2, 5 ] ],
          [ [ 3, 4 ], [ 3, 3 ], [ 3, 4 ] ], // spike is cut off
          [ [ 3, 4 ], [ 4, 4 ] ],
          [ [ 4, 4 ], [ 5, 4 ], [ 5, 1 ], [ 1, 1 ], [ 1, 4 ], [ 2, 4 ] ],
          [ [ 2, 4 ], [ 3, 4 ] ]
        ];
        assert.deepEqual(clippedLyr.shapes, [[[1, 6, 4]]]);
        assert.deepEqual(dataset.arcs.toArray(), targetArcs);
      }
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

      var map = api.internal.divideArcs(arcs);

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

      var clippedLyr = api.cmd.clipLayer(lyr1, lyr2, dataset);
      var target = [
        [[~3, 6, 4, ~1]],
        [[1, 5, 3]]];

      assert.deepEqual(clippedLyr.shapes, target);
    })

    /*
    // v0.4.0 no longer supports strings as clipping source parameters
    it ("Clip test 1 - variation", function() {
      var lyr1 = {
        geometry_type: "polygon",
        shapes: [[[0], [~1]], [[1]]]
      };
      var lyr2 = {
        name: 'clipper',
        geometry_type: "polygon",
        shapes: [[[2]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };
      // Variation - reference clip layer by name
      var clippedLyr = api.cmd.clipLayer(lyr1, 'clipper', dataset);
      var target = [
        [[~3, 6, 4, ~1]],
        [[1, 5, 3]]];

      assert.deepEqual(clippedLyr.shapes, target);
    })
    */

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

      var clippedLyr = api.cmd.clipLayer(lyr2, lyr1, dataset);
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

      var erasedLyr = api.cmd.eraseLayer(lyr1, lyr2, dataset);
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

      var map = api.internal.divideArcs(arcs);
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

      var clippedLyr = api.cmd.clipLayer(lyr1, lyr2, dataset);
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

      var clippedLyr = api.cmd.clipLayer(lyr2, lyr1, dataset);
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

      var erasedLyr = api.cmd.eraseLayer(lyr2, lyr1, dataset);
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

      var erasedLyr = api.cmd.eraseLayer(lyr1, lyr2, dataset);
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

      var map = api.internal.divideArcs(arcs);
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

      var clippedLyr = api.cmd.clipLayer(lyr1, lyr2, dataset);
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

      var clippedLyr = api.cmd.clipLayer(lyr2, lyr1, dataset);
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

      var clippedLyr = api.cmd.eraseLayer(lyr1, lyr2, dataset);
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

      var clippedLyr = api.cmd.eraseLayer(lyr2, lyr1, dataset);
      var target = [];

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

      var clippedLyr = api.cmd.eraseLayer(lyr2, lyr1, dataset);
      var target = [];

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

      var clippedLyr = api.cmd.clipLayer(lyr2, lyr1, dataset);
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

      var clippedLyr = api.cmd.clipLayer(lyr2, lyr1, dataset);
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

      var clippedLyr = api.cmd.clipLayer(lyr1, lyr2, dataset);
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

      var erasedLyr = api.cmd.eraseLayer(lyr2, lyr1, dataset);
      var target = [];
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

      var erasedLyr = api.cmd.eraseLayer(lyr1, lyr2, dataset);
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

      var clippedLyr = api.cmd.clipLayer(lyr2, lyr1, dataset);
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

      var erasedLyr = api.cmd.eraseLayer(lyr2, lyr1, dataset);
      var target = [];
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

      var erasedLyr = api.cmd.eraseLayer(lyr2, lyr1, dataset);
      var target = [];
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

      var clippedLyr = api.cmd.clipLayer(lyr2, lyr1, dataset);
      var target = [];
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

      var clippedLyr = api.cmd.eraseLayer(lyr2, lyr1, dataset);
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

      var clippedLyr = api.cmd.clipLayer(lyr2, lyr1, dataset);
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

      var clippedLyr = api.cmd.clipLayer(lyr1, lyr2, dataset);
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

      var clippedLyr = api.cmd.eraseLayer(lyr1, lyr2, dataset);
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

      var clippedLyr = api.cmd.eraseLayer(lyr2, lyr1, dataset);
      var target = [];
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

      var erasedLyr = api.cmd.eraseLayer(lyr1, lyr2, dataset);
      var target = [[[2, ~0]]];
      // var target = [[[3, ~1]]];
      assert.deepEqual(erasedLyr.shapes, target);
      assert.deepEqual(dataset.arcs.toArray(), coords.slice(1)); // arc 0 is removed (unused)
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
      var clippedLyr = api.cmd.clipLayer(targetLyr, clipLyr, dataset);
      var target = [[[0, 2]]];
      assert.deepEqual(clippedLyr.shapes, target);
      // check arc division
      var targetArcs = [[[3, 2], [3, 3]],
        [[3, 3], [3, 4], [4, 4], [3, 3]],
        [[3, 3], [2, 2], [2, 5], [5, 5], [5, 2], [3, 2]],
        [[1, 6], [6, 6], [6, 1], [1, 1], [1, 6]]];
      var clippedArcs = dataset.arcs.toArray();
      assert.deepEqual(clippedArcs, targetArcs);
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

      var erasedLyr = api.cmd.eraseLayer(targetLyr, clipLyr, dataset);
      var target = [];
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

      var clippedLyr = api.cmd.eraseLayer(targetLyr, clipLyr, dataset);
      var target = [];
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

      var clippedLyr = api.cmd.clipLayer(targetLyr, clipLyr, dataset);
      var target = [[[0]]];
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

      var erasedLyr = api.cmd.eraseLayer(targetLyr, clipLyr, dataset);
      var target = [];
      assert.deepEqual(erasedLyr.shapes, target);
    })
  })



})
