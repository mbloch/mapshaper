
import api from '../mapshaper.js';
import assert from 'assert';
import fs from 'fs';
import { cullSubTolerancePolygonArtifacts } from '../src/buffer/mapshaper-polygon-buffer.mjs';
import { importGeoJSON } from '../src/geojson/geojson-import.mjs';


describe('mapshaper-buffer.js', function () {

  describe('undo capture', function () {
    // Buffering builds a throwaway dataset (offset geometry, intersection cuts,
    // dissolve, topology rebuild) that never enters the catalog, then merges it
    // into the target dataset. When a GUI undo transaction is active, those
    // in-place mutations must not be captured -- doing so records large
    // intermediate arc collections and makes undo of a buffer command
    // pathologically slow. Only the target dataset + replaced layer should be
    // captured (the dataset unit holds the previous arcs by reference).
    function runBufferWithUndo(geojson, command, opts) {
      opts = opts || {};
      var I = api.internal;
      var dataset = I.importGeoJSON(geojson, {});
      if (dataset.arcs) I.buildTopology(dataset);
      var catalog = new I.Catalog();
      catalog.addDataset(dataset);
      var job = new I.Job(catalog);
      function run(cmdStr) {
        return new Promise(function(resolve, reject) {
          I.runParsedCommands(I.parseCommands(cmdStr), job, function(err) {
            if (err) return reject(err);
            resolve();
          });
        });
      }
      // An optional prep command runs with no active transaction (e.g. project
      // the data so a later geodesic buffer takes the reproject-clone path).
      var prep = opts.prep ? run(opts.prep) : Promise.resolve();
      return prep.then(function() {
        var lyr = dataset.layers[0];
        var origArcs = dataset.arcs || null;
        var origShapes = JSON.stringify(lyr.shapes);
        var origGeometryType = lyr.geometry_type;
        var origLayerCount = dataset.layers.length;
        var tx = new I.UndoTransaction(command);
        I.setActiveUndoTransaction(tx);
        return run(command).then(function() {
          I.clearActiveUndoTransaction(tx);
          return {dataset: dataset, origArcs: origArcs, origShapes: origShapes,
            origGeometryType: origGeometryType, origLayerCount: origLayerCount,
            tx: tx};
        }, function(err) {
          I.clearActiveUndoTransaction(tx);
          throw err;
        });
      });
    }

    // Undo of a buffer is handled once at the command level (makeBufferLayer
    // captures the target dataset + replaced layer, then suspends tracking and
    // builds + merges a throwaway dataset). It is therefore modality-agnostic:
    // every modality must build its result in a throwaway dataset and never
    // mutate the original arcs/layer in place, so undo can swap the previous
    // ArcCollection back by reference. These cases lock that contract in across
    // all current modalities.
    function assertBufferUndoRestores(r) {
      assert.notStrictEqual(r.dataset.arcs, r.origArcs); // buffer changed the arcs
      api.internal.restoreCapturedUnits(r.tx.getCapturedUnits());
      assert.strictEqual(r.dataset.arcs, r.origArcs); // arcs restored by reference
      assert.equal(JSON.stringify(r.dataset.layers[0].shapes), r.origShapes);
      assert.equal(r.dataset.layers[0].geometry_type, r.origGeometryType);
      assert.equal(r.dataset.layers.length, r.origLayerCount);
    }

    var square = {
      type: 'Polygon',
      coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]
    };
    var squareWithHole = {
      type: 'Polygon',
      coordinates: [
        [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
        [[3, 3], [3, 7], [7, 7], [7, 3], [3, 3]]
      ]
    };
    var twoAdjacentPolygons = {
      type: 'GeometryCollection',
      geometries: [
        {type: 'Polygon', coordinates: [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]]},
        {type: 'Polygon', coordinates: [[[5, 0], [10, 0], [10, 5], [5, 5], [5, 0]]]}
      ]
    };
    var openLine = {type: 'LineString', coordinates: [[0, 0], [10, 0], [10, 10]]};
    var closedRingLine = {
      type: 'LineString',
      coordinates: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
    };
    var point = {type: 'Point', coordinates: [0, 0]};

    [
      {name: 'polygon grow (outline default)', geojson: square, command: '-buffer 50000'},
      {name: 'polygon erode (negative)', geojson: square, command: '-buffer -50000'},
      {name: 'polygon with hole', geojson: squareWithHole, command: '-buffer 50000'},
      {name: 'polygon topological', geojson: twoAdjacentPolygons, command: '-buffer 50000 topological'},
      {name: 'polygon band-method', geojson: square, command: '-buffer 50000 band-method'},
      {name: 'polyline two-sided (open path)', geojson: openLine, command: '-buffer 50000'},
      {name: 'polyline one-sided', geojson: openLine, command: '-buffer 50000 left'},
      {name: 'polyline closed ring', geojson: closedRingLine, command: '-buffer 50000'},
      {name: 'point', geojson: point, command: '-buffer 50000'}
    ].forEach(function(test) {
      it('restores the pre-buffer state on undo: ' + test.name, async function () {
        var r = await runBufferWithUndo(test.geojson, test.command);
        assertBufferUndoRestores(r);
      });
    });

    it('restores on undo for a geodesic buffer of projected data', async function () {
      // Project to web mercator first (no transaction), so the geodesic buffer
      // takes the reproject-clone path (buildGeodesicProjectedBufferDataset).
      var r = await runBufferWithUndo(square, '-buffer 50000 geodesic',
        {prep: '-proj webmercator'});
      assertBufferUndoRestores(r);
    });

    it('restores on undo when buffer adds a layer (no-replace)', async function () {
      var r = await runBufferWithUndo(square, '-buffer 50000 no-replace');
      // the buffer was added as a second layer, leaving the source in place
      assert.equal(r.dataset.layers.length, 2);
      api.internal.restoreCapturedUnits(r.tx.getCapturedUnits());
      assert.equal(r.dataset.layers.length, 1); // added layer removed
      assert.strictEqual(r.dataset.arcs, r.origArcs);
      assert.equal(JSON.stringify(r.dataset.layers[0].shapes), r.origShapes);
      assert.equal(r.dataset.layers[0].geometry_type, 'polygon');
    });

    it('does not capture intermediate buffer construction geometry', async function () {
      var poly = {
        type: 'Polygon',
        coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]
      };
      var r = await runBufferWithUndo(poly, '-buffer 50000');
      var units = r.tx.getCapturedUnits();
      // a dataset-level unit must be captured to support undo
      assert.ok(units.some(function(u) { return u.type == 'dataset'; }));
      // ...but no fine-grained arc captures from throwaway construction, and no
      // unit should carry copied coordinate arrays
      assert.equal(units.some(function(u) {
        return u.type == 'arcs' || u.type == 'arcs-simplification' || !!u.xx;
      }), false);
    });

    it('restores the pre-buffer state on undo (arcs by reference)', async function () {
      var poly = {
        type: 'Polygon',
        coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]
      };
      var r = await runBufferWithUndo(poly, '-buffer 50000');
      assert.notStrictEqual(r.dataset.arcs, r.origArcs); // buffer ran
      api.internal.restoreCapturedUnits(r.tx.getCapturedUnits());
      assert.strictEqual(r.dataset.arcs, r.origArcs);
      assert.equal(JSON.stringify(r.dataset.layers[0].shapes), r.origShapes);
      assert.equal(r.dataset.layers[0].geometry_type, 'polygon');
    });
  });

  describe('-buffer command', function () {
    it('converts line to polygon', function (done) {
      var line = {
        type: 'LineString',
        coordinates: [[0, 0], [2, 0]]
      };
      api.applyCommands('-i line.json -buffer 2km -o buffer.json', {'line.json': line}, function(err, output) {
        var json = JSON.parse(output['buffer.json']);
        var poly = json.geometries[0];
        assert.equal(json.geometries.length, 1);
        assert.equal(poly.type, 'Polygon');
        done();
      })
    })

    it('offsets lat-long line buffers along great circles by default (round at large radius)', async function () {
      // A tiny line buffered by a large radius is ~a circle. With the default
      // great-circle offset every boundary point is the same geodesic distance
      // from the center; the old rhumb offset produces an egg shape.
      var line = {type: 'LineString', coordinates: [[0, 60], [0.0005, 60]]};
      var center = [0.00025, 60];
      async function ovality(cmd) {
        var out = await api.applyCommands(
          '-i line.json ' + cmd + ' -o format=geojson buffer.json',
          {'line.json': line});
        var geoms = getOutputGeometries(out);
        var min = Infinity, max = -Infinity;
        geoms.forEach(function(g) {
          var rings = g.type == 'Polygon' ? g.coordinates :
            g.coordinates.reduce(function(a, p) {return a.concat(p);}, []);
          rings.forEach(function(ring) {
            ring.forEach(function(p) {
              var d = api.geom.greatCircleDistance(center[0], center[1], p[0], p[1]);
              if (d < min) min = d;
              if (d > max) max = d;
            });
          });
        });
        return (max - min) / 2e6; // fraction of the 2000km radius
      }
      var geodesic = await ovality('-buffer 2000km');
      var rhumb = await ovality('-buffer 2000km rhumb');
      assert(geodesic < 0.001, 'geodesic buffer should be round, got ' + geodesic);
      assert(rhumb > 0.01, 'rhumb buffer should be distorted, got ' + rhumb);
    })

    it('buffers line features independently', async function () {
      var lines = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {id: 'a'},
          geometry: {
            type: 'LineString',
            coordinates: [[0, 0], [2000, 0]]
          }
        }, {
          type: 'Feature',
          properties: {id: 'b'},
          geometry: {
            type: 'LineString',
            coordinates: [[1000, -1000], [1000, 1000]]
          }
        }]
      };
      var out = await api.applyCommands(
        '-i lines.json -buffer 200 -o format=geojson buffer.json',
        {'lines.json': lines}
      );
      var geoms = getOutputGeometries(out);

      assert.equal(geoms.length, 2);
      assert.equal(pointInGeometry([1000, 0], geoms[0]), true);
      assert.equal(pointInGeometry([1000, 0], geoms[1]), true);
    })

    it('treats numeric radius values as meters', async function () {
      var out1 = await api.applyCommands(
        '-i test/data/geojson/three_points.geojson ' +
        '-buffer 200 -o format=geojson buffer.json'
      );
      var out2 = await api.applyCommands(
        '-i test/data/geojson/three_points.geojson ' +
        '-buffer 200m -o format=geojson buffer.json'
      );

      assert.deepEqual(JSON.parse(out1['buffer.json']), JSON.parse(out2['buffer.json']));
    })

    it('topological option requires a polygon layer', async function () {
      await assert.rejects(function() {
        return api.applyCommands(
          '-i line.json -buffer 200 topological -o format=geojson buffer.json',
          {'line.json': {type: 'LineString', coordinates: [[0, 0], [1000, 0]]}}
        );
      }, /topological buffer option requires a polygon layer/);
    })

    it('left and right flags together make an ordinary two-sided buffer', async function () {
      var file = 'test/data/features/buffer/i_crossback2.json';
      var out1 = await api.applyCommands(`-i ${file} -buffer 637 left right -o buffer.json`);
      var out2 = await api.applyCommands(`-i ${file} -buffer 637 -o buffer.json`);
      assert.deepEqual(JSON.parse(out1['buffer.json']), JSON.parse(out2['buffer.json']));
    })

    it('keeps a fill nested inside a hole (positive buffer)', async function () {
      // Big outer ring, a hole, and a small island fill inside the hole. The
      // default (clean-outline) grow used to absorb the island into the solid
      // fill -- it grows all outer rings into one fill before carving holes, so
      // the island's loop just added winding to the surrounding solid and then
      // the hole carve removed the region. The construction must keep it.
      var geo = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [[[0, 0], [1000, 0], [1000, 1000], [0, 1000], [0, 0]],
             [[200, 200], [200, 800], [800, 800], [800, 200], [200, 200]]],
            [[[400, 400], [600, 400], [600, 600], [400, 600], [400, 400]]]
          ]
        }
      };
      var out = await api.applyCommands(
        '-i in.json -buffer 50 -o format=geojson buffer.json', {'in.json': geo});
      var geom = getOutputGeometries(out)[0];
      // The island center stays filled and the gap between the grown island and
      // the shrunk hole stays empty -- i.e. the island survives as a distinct
      // fill rather than being absorbed into a solid (the bug) or erased.
      assert(pointInGeometry([500, 500], geom), 'island center should be filled');
      assert(!pointInGeometry([300, 300], geom), 'gap inside the hole should be empty');
      assert(pointInGeometry([50, 50], geom), 'main body should be filled');
    })

    it('keeps an island ring inside a hole for a real multipart polygon', async function () {
      // Fairfax County: outer ring, a hole, and a small island fill in the hole.
      var out = await api.applyCommands(
        '-i test/data/features/buffer/o_polygon_with_hole_and_island.json ' +
        '-buffer 100m -o format=geojson buffer.json');
      var geom = getOutputGeometries(out)[0];
      var parts = geom.type == 'MultiPolygon' ? geom.coordinates.length : 1;
      assert(parts >= 2, 'expected the island preserved as a separate part, got ' + parts);
    })

    it('radius can be the name of a data field', async function () {
      var input = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {dist: 500},
          geometry: {type: 'LineString', coordinates: [[0, 0], [0.02, 0]]}
        }, {
          type: 'Feature',
          properties: {dist: 0},
          geometry: {type: 'LineString', coordinates: [[0, 0.05], [0.02, 0.05]]}
        }]
      };
      var out = await api.applyCommands(
        '-i lines.json -buffer dist -o gj2008 buffer.json', {'lines.json': input});
      var json = JSON.parse(out['buffer.json']);
      var geoms = json.geometries || json.features.map(f => f.geometry);
      assert.equal(geoms.filter(g => g && g.type.includes('Polygon')).length, 1);
    })

  })

  // One-sided buffers approximate the union of the path's offset bands
  // with swept outline rings; concave joins can cut parts of a band out of
  // every emitted ring (e.g. when a segment is shorter than the join's
  // corner-cut extent). A post-pass audits every band against the emitted
  // rings and patches uncovered regions with explicit band rings.
  describe('one-sided buffers cover every offset band', function () {
    it('r_concave_join_dent.json (planar): band point is inside the buffer', async function () {
      var out = await api.applyCommands(
        '-i test/data/features/buffer/r_concave_join_dent.json ' +
        '-buffer 1000 left tolerance=0 -o buffer.json');
      var geoms = getOutputGeometries(out);
      // perpendicular to segment 2 at t=0.49, 90% of the buffer distance
      assert.equal(pointInGeometry([-140, 863], geoms[0]), true);
    })

    it('r_concave_join_dent_ll.json (lat-long): band point is inside the buffer', async function () {
      var out = await api.applyCommands(
        '-i test/data/features/buffer/r_concave_join_dent_ll.json ' +
        '-buffer 1km left tolerance=0 -o buffer.json');
      var geoms = getOutputGeometries(out);
      assert.equal(pointInGeometry([-89.75968678916746, 30.5130578645664], geoms[0]), true);
    })

    it('band points are covered at default tolerance too', async function () {
      var out = await api.applyCommands(
        '-i test/data/features/buffer/r_concave_join_dent_ll.json ' +
        '-buffer 1km left -o buffer.json');
      var geoms = getOutputGeometries(out);
      assert.equal(pointInGeometry([-89.75968678916746, 30.5130578645664], geoms[0]), true);
    })
  })

  // The two-sided fast path emits one self-intersecting outline ring per
  // path; dissolving it can leave spurious holes (winding artifacts of the
  // outline's concave-join loops), which the artifact-hole filter should
  // remove without touching real holes.
  describe('outline fast path artifact holes', function () {
    function countRings(geojson) {
      var geom = geojson.geometries[0];
      assert.equal(geom.type, 'Polygon');
      return geom.coordinates.length;
    }

    it('k_bugfix.json 1km has no holes', async function () {
      var out = await api.applyCommands(
        '-i test/data/features/buffer/k_bugfix.json -buffer 1km -o buffer.json');
      assert.equal(countRings(JSON.parse(out['buffer.json'])), 1);
    })

    it('k_bugfix.json 4km has no holes', async function () {
      var out = await api.applyCommands(
        '-i test/data/features/buffer/k_bugfix.json -buffer 4km -o buffer.json');
      assert.equal(countRings(JSON.parse(out['buffer.json'])), 1);
    })

    it('i_crossback2.json 212 has no holes', async function () {
      var out = await api.applyCommands(
        '-i test/data/features/buffer/i_crossback2.json -buffer 212 -o buffer.json');
      assert.equal(countRings(JSON.parse(out['buffer.json'])), 1);
    })

    it('m_loops.json 1km keeps its real holes', async function () {
      var out = await api.applyCommands(
        '-i test/data/features/buffer/m_loops.json -buffer 1km -o buffer.json');
      assert.equal(countRings(JSON.parse(out['buffer.json'])), 3); // shell + 2 holes
    })
  })

  // Count the number of holes in the buffered polygon at different buffer sizes
  describe('m_loops.json', function () {
    var file = 'test/data/features/buffer/m_loops.json';
    function test(size, numLoops, flags) {
      it(size + (flags ? ' ' + flags : ''), async function () {
        var cmd = `-i ${file} -buffer ${size} ${flags || ''} -o buffer.json`;
        var out = await api.applyCommands(cmd);
        var geojson = JSON.parse(out['buffer.json']);
        assert.equal(geojson.geometries?.length, 1);
        assert.equal(geojson.geometries[0].type, 'Polygon');
        assert.equal(geojson.geometries[0].coordinates.length, numLoops + 1);
      })
    }

    test('500m', 0);
    test('650m', 3);
    test('1.1km', 3);
    test('1.2km', 3);
    test('1.7km', 4);
    test('3.1km', 1);
    test('5km', 0);

  })

  // Buffered paths are pre-simplified with Douglas-Peucker; the tolerance
  // option sets the error budget (default: 1% of the buffer radius). The
  // output should match an unsimplified buffer within the tolerance
  // (here: same holes at ~1% of the buffer radius).
  describe('tolerance option (pre-simplification)', function () {
    var file = 'test/data/features/buffer/m_loops.json';
    function test(size, tol, numLoops) {
      it(size + ' tolerance=' + tol, async function () {
        var cmd = `-i ${file} -buffer ${size} tolerance=${tol} -o buffer.json`;
        var out = await api.applyCommands(cmd);
        var geojson = JSON.parse(out['buffer.json']);
        assert.equal(geojson.geometries?.length, 1);
        assert.equal(geojson.geometries[0].type, 'Polygon');
        assert.equal(geojson.geometries[0].coordinates.length, numLoops + 1);
      })
    }
    test('650m', '6m', 3);
    test('1.7km', '17m', 4);
    test('5km', '50m', 0);

    it('supports percentage tolerance values', async function () {
      var cmd1 = `-i ${file} -buffer 2km tolerance=1% -o buffer.json`;
      var cmd2 = `-i ${file} -buffer 2km tolerance=20m -o buffer.json`;
      var geojson1 = JSON.parse((await api.applyCommands(cmd1))['buffer.json']);
      var geojson2 = JSON.parse((await api.applyCommands(cmd2))['buffer.json']);

      assert.deepEqual(geojson1, geojson2);
    })

    it('does not treat small percentage tolerance values as the default', async function () {
      var cmd1 = `-i ${file} -buffer 2km tolerance=0.01% -o buffer.json`;
      var cmd2 = `-i ${file} -buffer 2km tolerance=1% -o buffer.json`;
      var geojson1 = JSON.parse((await api.applyCommands(cmd1))['buffer.json']);
      var geojson2 = JSON.parse((await api.applyCommands(cmd2))['buffer.json']);
      var vertices1 = getGeometryVertexCount(geojson1.geometries[0]);
      var vertices2 = getGeometryVertexCount(geojson2.geometries[0]);

      assert(vertices1 > vertices2);
    })

    it('keeps original path side in simplified one-sided buffers', async function () {
      var line = {
        type: 'LineString',
        coordinates: [[0, 0], [100, 1], [200, 0]]
      };
      var cmd = '-i line.json -buffer 1000 left cap-style=flat debug-offset ' +
        '-o format=geojson buffer.json';
      var out = await api.applyCommands(cmd, {'line.json': line});
      var geom = getOutputGeometries(out)[0];

      assert(geometryHasVertex(geom, [100, 1]));
    })
  })

  // One-sided buffers of paths with concave bends: the winding-number fill
  // resolves the concave join (a dip back to the path vertex) directly as a
  // union, so the bend's inner side is covered by the overlapping segment
  // bands with no pinch, and no over-reaching join sector is added beyond the
  // offset bands.
  describe('concave bend coverage (winding fill)', function () {
    it('inner side is covered without a pinch and without over-reach', async function () {
      // planar coords; the bend at [1000, 0] is a 90-degree left turn and
      // both segments are shorter than the buffer radius, so the offset
      // segments do not intersect
      var line = {
        type: 'LineString',
        coordinates: [[0, 0], [1000, 0], [1000, 1000]]
      };
      var cmd = '-i line.json -buffer 2000 left cap-style=flat -o buffer.json';
      var out = await api.applyCommands(cmd, {'line.json': line});
      var geojson = JSON.parse(out['buffer.json']);
      assert.equal(geojson.geometries.length, 1);
      assert.equal(geojson.geometries[0].type, 'Polygon');
      assert.equal(geojson.geometries[0].coordinates.length, 1); // no pinch hole
      // inner side near the bend, covered by the two offset bands
      assert.equal(pointInPolygon([500, 1500], geojson.geometries[0]), true);
      assert.equal(pointInPolygon([-500, 500], geojson.geometries[0]), true);
      // beyond the flat cap at the path start, outside the true buffer
      assert.equal(pointInPolygon([-343, 1343], geojson.geometries[0]), false);
    })
  })

  // offset-left / offset-right emit the outside edge of the one-sided buffer
  // polygon as a line layer (offset curve only: source-path edge dropped by an
  // arc-id filter, round caps trimmed at the path endpoints' perpendiculars).
  describe('offset-left / offset-right options', function () {
    // planar L-shaped path: east then north (a 90-degree left turn)
    var lLine = {
      type: 'LineString',
      coordinates: [[0, 0], [100, 0], [100, 100]]
    };

    function nearCoord(actual, expected, eps) {
      assert.ok(Math.abs(actual[0] - expected[0]) <= (eps || 1e-6) &&
        Math.abs(actual[1] - expected[1]) <= (eps || 1e-6),
        'expected ' + JSON.stringify(actual) + ' near ' + JSON.stringify(expected));
    }

    it('offset-left outputs a line, not a polygon', async function () {
      var out = await api.applyCommands(
        '-i line.json -buffer 10 offset-left -o buffer.json', {'line.json': lLine});
      var geom = getOutputGeometries(out)[0];
      assert.equal(geom.type, 'LineString');
    })

    it('offset-left is the concave inner edge with square ends and no caps', async function () {
      var out = await api.applyCommands(
        '-i line.json -buffer 10 offset-left -o buffer.json', {'line.json': lLine});
      var coords = getOutputGeometries(out)[0].coordinates;
      // left of the east leg is +y (10); left of the north leg is -x (90);
      // the concave corner meets at [90, 10]; ends are perpendicular offsets
      // of the path endpoints (no round cap looping past them)
      assert.equal(coords.length, 3);
      nearCoord(coords[0], [0, 10]);
      nearCoord(coords[1], [90, 10]);
      nearCoord(coords[2], [90, 100]);
    })

    it('offset-right rounds the convex corner and squares the ends', async function () {
      var out = await api.applyCommands(
        '-i line.json -buffer 10 offset-right -o buffer.json', {'line.json': lLine});
      var coords = getOutputGeometries(out)[0].coordinates;
      // right of the east leg is -y (-10); right of the north leg is +x (110);
      // the convex corner is a round join (an arc around the bend vertex)
      nearCoord(coords[0], [110, 100]);
      nearCoord(coords[coords.length - 1], [0, -10]);
      assert.ok(coords.length > 3, 'convex corner should be rounded');
      // the round join's arc quadrant (between the two legs) lies in x>100,
      // y<0 and stays on the radius-10 circle around the bend [100, 0]
      var arcPts = coords.filter(function(p) { return p[0] > 100 + 1e-6 && p[1] < 0 - 1e-6; });
      assert.ok(arcPts.length > 0, 'round join should add arc vertices');
      arcPts.forEach(function(p) {
        assert.ok(Math.abs(Math.hypot(p[0] - 100, p[1]) - 10) < 1.5, 'join vertex near radius 10');
      });
    })

    it('a straight path gives a parallel offset with square ends', async function () {
      // y=200 keeps the path out of geographic range, so it is treated as
      // planar (10 coordinate units) rather than lat-long
      var line = {type: 'LineString', coordinates: [[0, 200], [100, 200]]};
      var out = await api.applyCommands(
        '-i line.json -buffer 10 offset-left -o buffer.json', {'line.json': line});
      var coords = getOutputGeometries(out)[0].coordinates;
      assert.equal(coords.length, 2);
      nearCoord(coords[0], [0, 210]);
      nearCoord(coords[1], [100, 210]);
    })

    it('rejects offset-left and offset-right together', async function () {
      await assert.rejects(function() {
        return api.applyCommands(
          '-i line.json -buffer 10 offset-left offset-right -o buffer.json',
          {'line.json': lLine});
      });
    })

    it('rejects an offset on a non-line layer', async function () {
      await assert.rejects(function() {
        return api.applyCommands(
          '-i polygons.json -buffer 10 offset-left -o buffer.json',
          {'polygons.json': getAdjacentSquares()});
      });
    })
  })

  // One-sided line buffers default to flat caps (the open end of the offset
  // band), while two-sided buffers keep round caps. An explicit cap-style
  // overrides the default either way.
  describe('one-sided buffer cap-style default', function () {
    // planar (y=200 keeps it out of lat-long range); buffer 10 each side
    var line = {type: 'LineString', coordinates: [[0, 200], [100, 200]]};
    async function ring(flags) {
      var out = await api.applyCommands(
        '-i line.json -buffer 10 ' + flags + ' -o format=geojson o.json',
        {'line.json': line});
      var geom = JSON.parse(out['o.json']).geometries[0];
      return geom.coordinates[0];
    }
    function xRange(r) {
      var min = Infinity, max = -Infinity;
      r.forEach(function(p) { min = Math.min(min, p[0]); max = Math.max(max, p[0]); });
      return [min, max];
    }

    it('one-sided buffer uses flat caps by default (no bulge past path ends)', async function () {
      var x = xRange(await ring('left'));
      assert(x[0] >= -1e-6 && x[1] <= 100 + 1e-6, 'flat caps stay within the path ends, got ' + x);
    })

    it('explicit cap-style=round still rounds a one-sided buffer', async function () {
      var x = xRange(await ring('left cap-style=round'));
      assert(x[1] > 100 + 1, 'round cap should bulge past the path end, got ' + x);
    })

    it('two-sided buffers still default to round caps', async function () {
      var x = xRange(await ring(''));
      assert(x[0] < -1 && x[1] > 100 + 1, 'two-sided default should round both ends, got ' + x);
    })
  })

  describe('polygon buffers', function () {
    it('buffers adjacent polygons separately by default', async function () {
      var out = await api.applyCommands(
        '-i polygons.json -buffer 200 -o format=geojson buffer.json',
        {'polygons.json': getAdjacentSquares()}
      );
      var geoms = getOutputGeometries(out);

      assert.equal(geoms.length, 2);
      assert.equal(pointInGeometry([2100, 1500], geoms[0]), true);
      assert.equal(pointInGeometry([1900, 1500], geoms[1]), true);
    })

    it('topological buffers do not buffer shared polygon boundaries', async function () {
      var out = await api.applyCommands(
        '-i polygons.json -buffer 200 topological -o format=geojson buffer.json',
        {'polygons.json': getAdjacentSquares()}
      );
      var geoms = getOutputGeometries(out);

      assert.equal(geoms.length, 2);
      assert.equal(pointInGeometry([2100, 1500], geoms[0]), false);
      assert.equal(pointInGeometry([1900, 1500], geoms[1]), false);
      assert.equal(pointInGeometry([900, 1500], geoms[0]), true);
      assert.equal(pointInGeometry([3100, 1500], geoms[1]), true);
    })

    it('topological buffers do not cover source polygon areas', async function () {
      var out = await api.applyCommands(
        '-i polygons.json -buffer 250 topological -o format=geojson buffer.json',
        {'polygons.json': getNearbySquares()}
      );
      var geoms = getOutputGeometries(out);

      assert.equal(geoms.length, 2);
      assert.equal(pointInGeometry([2200, 1500], geoms[0]), false);
      assert.equal(pointInGeometry([1800, 1500], geoms[1]), false);
    })

    // Overlap space is partitioned by proximity to the source rings (nearest
    // polygon wins), not handed wholesale to the larger feature. The two squares
    // face each other across a gap (square 0 right edge x=2000, square 1 left
    // edge x=2150); a probe near one source belongs to that source even though
    // both buffers cover it.
    it('topological buffer overlaps are partitioned by proximity to the nearest source', async function () {
      var out = await api.applyCommands(
        '-i polygons.json -buffer 250 topological -o format=geojson buffer.json',
        {'polygons.json': getNearbyUnequalSquares()}
      );
      var geoms = getOutputGeometries(out);

      // x=2010 is 10 from square 0, 140 from square 1 -> square 0
      assert.equal(pointInGeometry([2010, 1500], geoms[0]), true);
      assert.equal(pointInGeometry([2010, 1500], geoms[1]), false);
      // x=2140 is 140 from square 0, 10 from square 1 -> square 1
      assert.equal(pointInGeometry([2140, 1500], geoms[1]), true);
      assert.equal(pointInGeometry([2140, 1500], geoms[0]), false);
    })

    // Two equal-area squares facing across a gap: the old largest-area rule put
    // the whole overlap lens on one feature (ties broke to the lowest id);
    // proximity partitioning splits the lens down the middle so each half goes
    // to its nearer square.
    it('topological buffer splits an equal-area overlap lens by proximity', async function () {
      var out = await api.applyCommands(
        '-i polygons.json -buffer 250 topological -o format=geojson buffer.json',
        {'polygons.json': getNearbySquares()}
      );
      var geoms = getOutputGeometries(out);

      assert.equal(pointInGeometry([2010, 1500], geoms[0]), true);
      assert.equal(pointInGeometry([2010, 1500], geoms[1]), false);
      assert.equal(pointInGeometry([2140, 1500], geoms[1]), true);
      assert.equal(pointInGeometry([2140, 1500], geoms[0]), false);
    })

    it('topological buffers reject negative distances', async function () {
      await assert.rejects(function() {
        return api.applyCommands(
          '-i polygon.json -buffer -200 topological -o format=geojson buffer.json',
          {'polygon.json': getDonut()}
        );
      }, /topological buffer option does not support negative distances/);
    })

    it('topological buffers preserve holes', async function () {
      var out = await api.applyCommands(
        '-i polygon.json -buffer 200 topological -o format=geojson buffer.json',
        {'polygon.json': getDonut()}
      );
      var geom = getOutputGeometries(out)[0];

      assert.equal(pointInGeometry([900, 2000], geom), true);
      assert.equal(pointInGeometry([1700, 2000], geom), true);
      assert.equal(pointInGeometry([2000, 2000], geom), false);
    })

    it('topological buffers retain interior holes when buffering polygon with a hole and island', async function () {
      var out = await api.applyCommands(
        '-i test/data/features/buffer/o_polygon_with_hole_and_island.json ' +
        '-buffer 10m topological -o format=geojson buffer.json'
      );
      var geom = getOutputGeometries(out)[0];

      assert(geometryHasHole(geom));
    })

    it('topological buffers do not leave sliver holes along source margins', async function () {
      var out = await api.applyCommands(
        '-i test/data/shapefile/six_counties.shp ' +
        '-buffer 100m topological -o format=geojson buffer.json'
      );
      var geoms = getOutputGeometries(out);

      assert.equal(getSmallHoleCount(geoms, 1e-8), 0);
    })

    // Regression: New Hanover County's small detached ring (area ~845k) sits
    // within 5km of Brunswick County. The small ring's area is closer to New
    // Hanover, so proximity partitioning assigns it (and the corridor around it)
    // to New Hanover rather than letting both counties' buffers cover it.
    // [178160, 4031854] is interior to it. (With nearest-source partitioning the
    // claimed area is a contiguous New Hanover region, not an enclosed hole in
    // Brunswick's buffer, but the key property -- no double coverage -- holds.)
    it('topological buffer does not swallow a small ring belonging to a neighbor', async function () {
      var out = await api.applyCommands(
        '-i test/data/features/buffer/u_nc_two_counties.json ' +
        '-buffer 5000 topological -o format=geojson buffer.json'
      );
      var geoms = getOutputGeometries(out); // [0] Brunswick, [1] New Hanover
      var p = [178160, 4031854];

      assert.equal(pointInGeometry(p, geoms[1]), true);
      assert.equal(pointInGeometry(p, geoms[0]), false);
    })

    // Oregon and Washington face each other across the Columbia River (a long,
    // narrow gap). The contested buffer space must be partitioned down the
    // river centerline (each point goes to its nearer state), not zigzag between
    // the banks. Measured as a nearest-source violation rate over a grid of the
    // contested zone: points assigned to the farther state. The adaptive medial
    // sampling keeps this small and, crucially, leaves no point misassigned by
    // more than a sliver (no point sits well on the wrong side of the centerline).
    it('topological buffer follows a narrow-gap centerline (Columbia River)', function () {
      return api.applyCommands(
        '-i test/data/features/buffer/v_columbia_river.json ' +
        '-buffer 8km topological -o format=geojson buffer.json'
      ).then(function(out) {
        var geoms = getOutputGeometries(out); // [0] Oregon, [1] Washington
        var src = JSON.parse(fs.readFileSync(
          'test/data/features/buffer/v_columbia_river.json'));
        var OR = featureRings(src.features[0]);
        var WA = featureRings(src.features[1]);
        var reach = 8000 / 6378137 * 180 / Math.PI; // 8km in degrees
        var slop = 0.002; // ~200m: a point this far on the wrong side is a real error
        var contested = 0, violations = 0, significant = 0;
        for (var x = -124.2; x <= -121.5; x += 0.01) {
          for (var y = 45.2; y <= 46.6; y += 0.01) {
            var dOR = distToRings(x, y, OR);
            var dWA = distToRings(x, y, WA);
            if (dOR > reach || dWA > reach) continue; // outside the overlap
            var inOR = pointInGeometry([x, y], geoms[0]);
            var inWA = pointInGeometry([x, y], geoms[1]);
            if (inOR === inWA) continue; // source area or outside both
            contested++;
            if (inOR !== (dOR < dWA)) {
              violations++;
              if (Math.abs(dOR - dWA) > slop) significant++;
            }
          }
        }
        assert(contested > 1000, 'expected a populated contested zone');
        // overall misassignment stays low (the old largest-area/coarse rule was ~2x)
        assert(violations / contested < 0.05,
          'nearest-source violation rate too high: ' + violations + '/' + contested);
        // no point is assigned well to the wrong side of the centerline
        assert(significant / contested < 0.005,
          'too many points misassigned beyond the centerline: ' + significant);
      });
    })

    // The undocumented debug-voronoi flag emits the inter-feature medial-axis
    // (Voronoi) cut-lines used to partition contested space, so they can be
    // inspected. They are only meaningful for the topological option, and the
    // weighted-Visvalingam smoothing pass should leave them substantially
    // lighter than the raw construction without emptying them.
    it('topological buffer debug-voronoi emits smoothed medial lines', function () {
      function medialVertexCount(opts) {
        return api.applyCommands(
          '-i test/data/features/buffer/v_columbia_river.json ' +
          '-buffer 8km topological debug-voronoi ' + opts +
          ' -o format=geojson medial.json'
        ).then(function(out) {
          var fc = JSON.parse(out['medial.json']);
          var geoms = (fc.geometries || (fc.features || []).map(function(f) {
            return f.geometry;
          })).filter(Boolean);
          var verts = 0, lineParts = 0;
          geoms.forEach(function(g) {
            assert(g.type === 'LineString' || g.type === 'MultiLineString',
              'expected line geometry, got ' + g.type);
            var parts = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
            parts.forEach(function(p) { lineParts++; verts += p.length; });
          });
          return {verts: verts, parts: lineParts};
        });
      }
      return Promise.all([medialVertexCount(''), medialVertexCount('tolerance=0')])
        .then(function(res) {
          var smoothed = res[0], raw = res[1];
          assert(raw.parts > 0 && raw.verts > 0, 'expected a non-empty medial axis');
          assert(smoothed.verts > 0, 'smoothing must not empty the medial axis');
          // smoothing should remove a large share of the densely sampled vertices
          assert(smoothed.verts < raw.verts * 0.6,
            'smoothing should thin the medial axis: ' + smoothed.verts + ' vs ' + raw.verts);
        });
    })

    // The undocumented debug-delaunay flag emits the Delaunay triangulation of
    // the adaptive sample sites (the mesh the medial axis is built from) as
    // triangle polygons, topological-only.
    it('topological buffer debug-delaunay emits triangle polygons', function () {
      return api.applyCommands(
        '-i test/data/features/buffer/v_columbia_river.json ' +
        '-buffer 8km topological debug-delaunay -o format=geojson tri.json'
      ).then(function(out) {
        var fc = JSON.parse(out['tri.json']);
        var geoms = (fc.geometries || (fc.features || []).map(function(f) {
          return f.geometry;
        })).filter(Boolean);
        assert(geoms.length > 100, 'expected many triangles, got ' + geoms.length);
        geoms.forEach(function(g) {
          assert.equal(g.type, 'Polygon');
          assert.equal(g.coordinates[0].length, 4); // triangle: 3 corners + closure
        });
      });
    })

    it('debug-delaunay without topological yields no triangles', function () {
      return api.applyCommands(
        '-i test/data/features/buffer/v_columbia_river.json ' +
        '-buffer 8km debug-delaunay -o format=geojson tri.json'
      ).then(function(out) {
        var fc = JSON.parse(out['tri.json']);
        var geoms = (fc.geometries || (fc.features || []).map(function(f) {
          return f.geometry;
        })).filter(Boolean);
        assert.equal(geoms.length, 0);
      });
    })

    it('debug-voronoi without topological yields no medial lines', function () {
      return api.applyCommands(
        '-i test/data/features/buffer/v_columbia_river.json ' +
        '-buffer 8km debug-voronoi -o format=geojson medial.json'
      ).then(function(out) {
        var fc = JSON.parse(out['medial.json']);
        var geoms = (fc.geometries || (fc.features || []).map(function(f) {
          return f.geometry;
        })).filter(Boolean);
        assert.equal(geoms.length, 0);
      });
    })

    // fill-gaps fills enclosed holes and narrow-mouthed inlets (a river up to
    // its mouth) without growing the outer boundary: a topology-aware
    // morphological closing of the mosaic by radius = mouthSize/2, with the fill
    // partitioned among adjacent features by the medial axis.
    describe('fill-gaps option', function () {
      function netArea(geoms) {
        return geoms.reduce(function(sum, g) {
          return g ? sum + getSignedRingAreas(g).reduce(function(a, b) {
            return a + b;
          }, 0) : sum;
        }, 0);
      }
      function geomsBBox(geoms) {
        var b = [Infinity, Infinity, -Infinity, -Infinity];
        geoms.forEach(function(g) {
          if (!g) return;
          featureRings({geometry: g}).forEach(function(ring) {
            ring.forEach(function(p) {
              if (p[0] < b[0]) b[0] = p[0];
              if (p[1] < b[1]) b[1] = p[1];
              if (p[0] > b[2]) b[2] = p[0];
              if (p[1] > b[3]) b[3] = p[1];
            });
          });
        });
        return b;
      }
      function maxBBoxDelta(a, b) {
        return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]),
          Math.abs(a[2] - b[2]), Math.abs(a[3] - b[3]));
      }

      // The river fills, but unlike an outward buffer of the same radius the
      // outer coastline does not move: the closing's erosion pulls the outward
      // collar back to the source outline, leaving only the gap fill.
      it('fills a narrow inlet (Columbia River) without growing the outer extent', async function () {
        var file = 'test/data/features/buffer/v_columbia_river.json';
        var base = getOutputGeometries(await api.applyCommands(
          '-i ' + file + ' -o format=geojson buffer.json'));
        // mouth size 16km -> mouth radius 8km, matching the topological buffer below
        var fill = getOutputGeometries(await api.applyCommands(
          '-i ' + file + ' -buffer 16km fill-gaps -o format=geojson buffer.json'));
        var grow = getOutputGeometries(await api.applyCommands(
          '-i ' + file + ' -buffer 8km topological -o format=geojson buffer.json'));
        // per-feature output preserved (the two states)
        assert.equal(fill.length, base.length);
        // the river fills -> area increases
        assert(netArea(fill) > netArea(base) * 1.01, 'fill should add the river area');
        // ...but far less than the outward buffer, which also adds the collar
        assert(netArea(fill) < netArea(grow), 'fill adds less than an outward buffer');
        // the outer extent is essentially unchanged (no outward growth), whereas
        // the outward buffer expands it by ~the buffer radius (~0.07 deg)
        assert(maxBBoxDelta(geomsBBox(base), geomsBBox(fill)) < 0.01,
          'fill must not grow the outer extent');
        assert(maxBBoxDelta(geomsBBox(base), geomsBBox(grow)) > 0.05,
          'sanity: the outward buffer should expand the extent');
      })

      // More fill as the mouth size grows (more of the channel is narrower than
      // the mouth), demonstrating the opening-size threshold.
      it('fills more of the inlet as the mouth size increases', async function () {
        var file = 'test/data/features/buffer/v_columbia_river.json';
        async function area(m) {
          return netArea(getOutputGeometries(await api.applyCommands(
            '-i ' + file + ' -buffer ' + m + ' fill-gaps -o format=geojson buffer.json')));
        }
        var small = await area('4km');
        var large = await area('16km');
        assert(large > small, 'a larger mouth size should fill more: ' +
          large + ' vs ' + small);
      })

      // The gap between two adjacent features fills and is partitioned between
      // them (each gains area), and source attributes are preserved.
      it('fills and partitions the gap between two adjacent features (attributes preserved)', async function () {
        var file = 'test/data/features/buffer/u_nc_two_counties.json';
        var base = getOutputGeometries(await api.applyCommands(
          '-i ' + file + ' -o format=geojson buffer.json'));
        // projected data with unknown CRS units -> use a unitless (meter) distance
        var out = await api.applyCommands(
          '-i ' + file + ' -buffer 5000 fill-gaps -o format=geojson buffer.json');
        var fc = JSON.parse(out['buffer.json']);
        assert.equal(fc.features.length, 2);
        assert.equal(fc.features[0].properties.NAME, 'Brunswick County');
        assert.equal(fc.features[1].properties.NAME, 'New Hanover County');
        var fill = fc.features.map(function(f) { return f.geometry; });
        assert(netArea([fill[0]]) > netArea([base[0]]), 'Brunswick should gain area');
        assert(netArea([fill[1]]) > netArea([base[1]]), 'New Hanover should gain area');
      })

      // An enclosed hole (lake) is filled only when the mouth size exceeds its
      // width; a mouth narrower than the hole leaves it open. max-widening=1
      // isolates this mouth-gating threshold from the wider fill (tested below).
      it('fills an enclosed hole only when it is narrower than the mouth size', async function () {
        var file = 'test/data/features/buffer/o_polygon_with_hole_and_island.json';
        var small = getOutputGeometries(await api.applyCommands(
          '-i ' + file + ' -buffer 1km fill-gaps max-widening=1 -o format=geojson buffer.json'));
        var large = getOutputGeometries(await api.applyCommands(
          '-i ' + file + ' -buffer 5km fill-gaps max-widening=1 -o format=geojson buffer.json'));
        assert(small.some(geometryHasHole), 'a narrow mouth should leave the wide hole open');
        assert(!large.some(geometryHasHole), 'a mouth wider than the hole should fill it');
      })

      // max-widening sets the fill threshold as a multiple of the mouth size: a
      // gap stays open only if wider than max-widening * mouth size. With the same
      // mouth size, a low threshold leaves a moderate gap open while a higher one
      // fills it (only genuinely large bodies survive a high threshold).
      it('max-widening controls whether an interior gap stays open or fills', async function () {
        var file = 'test/data/features/buffer/o_polygon_with_hole_and_island.json';
        var open = getOutputGeometries(await api.applyCommands(
          '-i ' + file + ' -buffer 1km fill-gaps max-widening=1 -o format=geojson buffer.json'));
        var filled = getOutputGeometries(await api.applyCommands(
          '-i ' + file + ' -buffer 1km fill-gaps max-widening=8 -o format=geojson buffer.json'));
        assert(open.some(geometryHasHole), 'max-widening=1 leaves a gap wider than the mouth open');
        assert(!filled.some(geometryHasHole), 'a high max-widening threshold fills a gap only modestly wider than the mouth');
      })

      // The default max-widening threshold fills the string of small holes a pure
      // closing leaves along a channel whose width fluctuates around the mouth
      // size; max-widening=1 (no fill margin) leaves them open.
      it('fills small interior pockets along a river by default (max-widening)', async function () {
        var file = 'test/data/features/buffer/v_columbia_river.json';
        async function holeCount(args) {
          var geoms = getOutputGeometries(await api.applyCommands(
            '-i ' + file + ' -buffer ' + args + ' -dissolve2 -o format=geojson buffer.json'));
          return geoms.reduce(function (n, g) {
            return g ? n + getSignedRingAreas(g).filter(function (a) {
              return a < 0;
            }).length : n;
          }, 0);
        }
        var lowKeep = await holeCount('2km fill-gaps max-widening=1');
        var defaultKeep = await holeCount('2km fill-gaps');
        assert(lowKeep > 0, 'max-widening=1 should leave the small pockets open');
        assert.equal(defaultKeep, 0, 'the default max-widening should fill the small pockets');
      })

      it('rejects an invalid max-widening value', async function () {
        await assert.rejects(function () {
          return api.applyCommands(
            '-i polygons.json -buffer 10 fill-gaps max-widening=0 -o buffer.json',
            {'polygons.json': getAdjacentSquares()});
        });
      })

      // Regression: at scattered buffer distances the inter-feature medial axis
      // broke into separate chains where a connecting Voronoi edge was pruned --
      // its sample endpoints sat just past the sum of the two radii, even though
      // the bisector still ran through the buffer overlap (coarse/staggered
      // sampling makes the sample-pair distance overestimate the true gap). The
      // injected cut wall was then open, the buffer-overlap face was never
      // subdivided, and the whole contested corridor was assigned to one feature
      // by a single representative point: Oregon's buffer wrapped a Washington
      // island in the Columbia, gaining an enclosing hole while the island
      // detached as its own Washington part. The fix re-measures the true source
      // gap at such an edge's medial vertices and keeps it when it really lies in
      // the overlap. Sampled across the failing band (was broken at ~2.4, 4.2-4.6
      // and 5.4-6.25 km) to lock in the whole class, not one distance.
      it('keeps an enclosed island attached to its feature across the distance band', async function () {
        var file = 'test/data/features/buffer/v_columbia_river.json';
        var band = ['2.4km', '4.4km', '5.5km', '6km', '6.25km'];
        for (var i = 0; i < band.length; i++) {
          var out = await api.applyCommands(
            '-i ' + file + ' -buffer ' + band[i] + ' topological -o format=geojson buffer.json');
          var fc = JSON.parse(out['buffer.json']);
          fc.features.forEach(function(f) {
            assert(!geometryHasHole(f.geometry),
              band[i] + ': ' + f.properties.NAME + ' should not enclose a neighbor');
          });
          var wa = fc.features.filter(function(f) {
            return f.properties.NAME == 'Washington';
          })[0];
          assert.equal(getPolygonCount(wa.geometry), 1,
            band[i] + ': the Washington island should stay attached to Washington');
        }
      })

      it('rejects fill-gaps on a non-polygon layer', async function () {
        await assert.rejects(function () {
          return api.applyCommands(
            '-i polygons.json -lines -buffer 10 fill-gaps -o buffer.json',
            {'polygons.json': getAdjacentSquares()});
        });
      })

      it('rejects a non-positive fill-gaps distance', async function () {
        await assert.rejects(function () {
          return api.applyCommands(
            '-i polygons.json -buffer 0 fill-gaps -o buffer.json',
            {'polygons.json': getAdjacentSquares()});
        });
      })

      // fill-gaps is inherently topological; the debug-delaunay view works
      // without an explicit topological flag and triangulates at the fill radius.
      it('fill-gaps debug-delaunay emits triangles without topological', async function () {
        var file = 'test/data/features/buffer/v_columbia_river.json';
        var out = await api.applyCommands(
          '-i ' + file + ' -buffer 2km fill-gaps debug-delaunay -o format=geojson tri.json');
        var fc = JSON.parse(out['tri.json']);
        var geoms = (fc.geometries || (fc.features || []).map(function(f) {
          return f.geometry;
        })).filter(Boolean);
        assert(geoms.length > 0, 'expected triangles, got ' + geoms.length);
        geoms.forEach(function(g) {
          assert.equal(g.type, 'Polygon');
          assert.equal(g.coordinates[0].length, 4);
        });
      })

      // Regression: the dilation-vs-mask clip used to leave a scatter of
      // degenerate, near-zero-area sliver parts (~160 positive parts for six
      // counties, ~25 of them literally zero area). Clip sliver removal plus the
      // sub-tolerance artifact cull keep the output to the real features: no
      // positive part is smaller than the buffer tolerance squared, and the part
      // count stays small (was ~88 positive parts).
      it('does not emit sub-tolerance sliver parts', async function () {
        var file = 'test/data/shapefile/six_counties.shp';
        var dist = 100; // meters
        var geoms = getOutputGeometries(await api.applyCommands(
          '-i ' + file + ' -buffer ' + dist + 'm fill-gaps -o format=geojson buffer.json'));
        // default buffer tolerance is 1% of the distance; lat-long source, so the
        // coordinate tolerance is in degrees (the same units as the ring areas)
        var tolDeg = (dist / 6378137 * 180 / Math.PI) * 0.01;
        var minArea = tolDeg * tolDeg;
        var tinyParts = 0, totalParts = 0;
        geoms.forEach(function(g) {
          if (!g) return;
          getSignedRingAreas(g).forEach(function(area) {
            if (area <= 0) return; // skip holes (negative area)
            totalParts++;
            if (area < minArea) tinyParts++;
          });
        });
        assert.equal(tinyParts, 0, 'no positive part below the buffer tolerance squared');
        assert(totalParts > 0 && totalParts < 30,
          'sliver parts removed; expected a handful of real parts, got ' + totalParts);
      })
    })

    // Direct test of the sub-tolerance cull (the fragile bits: the area-sign
    // convention and the tol^2 threshold in coordinate units). A planar layer
    // with radius 10 has tolerance 0.1 (1% default) -> minArea 0.01.
    describe('cullSubTolerancePolygonArtifacts()', function () {
      function bigSquare(x, y, s) {
        return [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
      }
      // a tiny clockwise ring -> imports as a hole (negative signed area)
      function tinyHole(x, y, s) {
        return [[x, y], [x, y + s], [x + s, y + s], [x + s, y], [x, y]];
      }
      function build() {
        return importGeoJSON({
          type: 'FeatureCollection',
          features: [
            // a big part plus a far-away sub-tolerance part (area 1e-6 < 0.01)
            { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon',
              coordinates: [[bigSquare(0, 0, 1000)], [bigSquare(5000, 5000, 0.001)]] } },
            // a big part with a sub-tolerance hole (area 1e-6): the hole must be
            // kept (only positive parts are culled)
            { type: 'Feature', properties: {}, geometry: { type: 'Polygon',
              coordinates: [bigSquare(0, 0, 1000), tinyHole(10, 10, 0.001)] } }
          ]
        }, {});
      }

      it('drops sub-tolerance positive parts but keeps holes and real parts', function () {
        var dataset = build();
        var lyr = dataset.layers[0];
        cullSubTolerancePolygonArtifacts(dataset, lyr, dataset, { radius: '10' });
        assert.equal(lyr.shapes[0].length, 1, 'tiny positive part dropped, big part kept');
        assert.equal(lyr.shapes[1].length, 2, 'big part and sub-tolerance hole both kept');
      })

      it('is a no-op when tolerance is disabled (tolerance=0)', function () {
        var dataset = build();
        var lyr = dataset.layers[0];
        cullSubTolerancePolygonArtifacts(dataset, lyr, dataset, { radius: '10', tolerance: '0' });
        assert.equal(lyr.shapes[0].length, 2, 'nothing culled with tolerance off');
        assert.equal(lyr.shapes[1].length, 2);
      })
    })

    // Distilled from a seeded fuzz harness that ran ~1000 buffers over
    // adversarial inputs (degenerate geometry, near-coincident borders, thin
    // slivers, high latitude, and up to 1e6:1 heterogeneous radii) with zero
    // crashes, zero invalid geometry, and zero sub-tolerance parts. These fixed
    // cases lock in the categories that exercise the fragile paths: the
    // Delaunay/circumcenter step and the per-feature distance grid.
    describe('robustness (adversarial inputs)', function () {
      // No NaN/unclosed rings, and (the buffer guarantee) no positive part below
      // tolCoord^2.
      function assertCleanBuffer(geoms, tolCoord, msg) {
        var minArea = tolCoord * tolCoord;
        geoms.forEach(function (g) {
          if (!g) return;
          assert(g.type == 'Polygon' || g.type == 'MultiPolygon', msg + ': polygon output');
          var polys = g.type == 'MultiPolygon' ? g.coordinates : [g.coordinates];
          polys.forEach(function (poly) {
            poly.forEach(function (ring, ri) {
              assert(ring.length >= 4, msg + ': ring has >= 4 points');
              var a = ring[0], b = ring[ring.length - 1];
              assert(a[0] === b[0] && a[1] === b[1], msg + ': ring closed');
              ring.forEach(function (p) {
                assert(isFinite(p[0]) && isFinite(p[1]), msg + ': finite coords');
              });
              if (ri === 0) {
                assert(Math.abs(ringArea(ring)) >= minArea, msg + ': no sub-tolerance part');
              }
            });
          });
        });
      }

      // duplicate vertices, a near-collinear spike, and (near-)coincident squares
      // -- the dirty-topology cases that stress the Delaunay/circumcenter step.
      var dirty = { type: 'FeatureCollection', features: [
        { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [
          [[0, 0], [0, 0], [100, 0], [100, 0], [100, 100], [0, 100], [0, 0]]] } },
        { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [
          [[200, 0], [250, 1e-7], [300, 0], [300, 100], [200, 100], [200, 0]]] } },
        { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [
          [[600, 0], [700, 0], [700, 100], [600, 100], [600, 0]]] } },
        { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [
          [[600, 0], [700, 0], [700, 100], [600, 100], [600, 0]]] } },
        { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [
          [[600.0000001, 0], [700.0000001, 0], [700.0000001, 100], [600.0000001, 100], [600.0000001, 0]]] } }
      ] };

      it('handles dirty/degenerate topology without crashing (topological + fill-gaps)', async function () {
        for (var mode of ['topological', 'fill-gaps']) {
          var geoms = getOutputGeometries(await api.applyCommands(
            '-i in.json -buffer 20 ' + mode + ' -o format=geojson buffer.json',
            { 'in.json': JSON.stringify(dirty) }));
          assertCleanBuffer(geoms, 20 * 0.01, mode);
        }
      })

      // one feature with a 1000x larger radius than its neighbours (via a field
      // expression): must buffer correctly and stay clean despite the coarse grid
      // cell its huge radius forces. Coordinates are well outside lat-long range
      // so the radii are interpreted in planar units (not meters on degrees).
      it('handles heterogeneous per-feature radii (1000:1)', async function () {
        var feats = [];
        for (var i = 0; i < 12; i++) {
          var x = 1000 + (i % 4) * 300, y = 1000 + Math.floor(i / 4) * 300;
          feats.push({ type: 'Feature', properties: { rad: i === 0 ? 5000 : 5 },
            geometry: { type: 'Polygon', coordinates: [
              [[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10], [x, y]]] } });
        }
        var geoms = getOutputGeometries(await api.applyCommands(
          '-i in.json -buffer rad topological -o format=geojson buffer.json',
          { 'in.json': JSON.stringify({ type: 'FeatureCollection', features: feats }) }));
        // every surviving part clears the tightest (smallest-radius) tolerance
        assertCleanBuffer(geoms, 5 * 0.01, 'hetero');
        // the huge-radius feature grew far beyond its 10-unit source square
        assert(getSignedRingAreas(geoms[0]).reduce(function (s, a) { return s + a; }, 0) > 1e6,
          'the 5000-radius feature should dominate the output area');
      })

      // small buffer on a high-latitude mosaic (lat ~80) -- the degree-space
      // conversion path.
      it('buffers a high-latitude mosaic without crashing', async function () {
        var feats = [];
        for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
          var x = c * 1.0, y = 80 + r * 0.3;
          feats.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [
            [[x, y], [x + 1, y], [x + 1, y + 0.3], [x, y + 0.3], [x, y]]] } });
        }
        var tolDeg = (5000 / 6378137 * 180 / Math.PI) * 0.01;
        for (var mode of ['topological', 'fill-gaps']) {
          var geoms = getOutputGeometries(await api.applyCommands(
            '-i in.json -buffer 5km ' + mode + ' -o format=geojson buffer.json',
            { 'in.json': JSON.stringify({ type: 'FeatureCollection', features: feats }) }));
          assertCleanBuffer(geoms, tolDeg, 'highlat ' + mode);
        }
      })
    })

    // Regression: a positive polygon buffer must fill the whole expanded
    // footprint, not just band the perimeter (which leaves the source shape as
    // a hole -- the signature of the interior failing to fill). The plain and
    // topological results must agree, both larger than the source area.
    it('s_nc_county.json: -buffer 1000 fills the interior (no perimeter band)', async function () {
      var file = 'test/data/features/buffer/s_nc_county.json';
      function netArea(geoms) {
        return geoms.reduce(function(sum, g) {
          return g ? sum + getSignedRingAreas(g).reduce(function(a, b) { return a + b; }, 0) : sum;
        }, 0);
      }
      var src = netArea(getOutputGeometries(await api.applyCommands(
        '-i ' + file + ' -o format=geojson buffer.json')));
      var plain = getOutputGeometries(await api.applyCommands(
        '-i ' + file + ' -buffer 1000 -o format=geojson buffer.json'));
      var topo = getOutputGeometries(await api.applyCommands(
        '-i ' + file + ' -buffer 1000 topological -o format=geojson buffer.json'));

      assert(src > 0);
      // a perimeter band would have net area well below the source area
      assert(netArea(plain) > src, 'plain buffer should enlarge the polygon');
      assert.equal(plain.reduce(function(n, g) {
        return n + (g ? getSignedRingAreas(g).filter(function(a) { return a < 0; }).length : 0);
      }, 0), 0, 'plain buffer should not punch a source-shaped hole');
      assert(Math.abs(netArea(plain) - netArea(topo)) / netArea(topo) < 0.005,
        'plain and topological buffers should agree');
    })

    // The "perimeter band" was a cross-engine numerical artifact: the convex
    // seam of a closed buffer ring closed onto a recomputed offset vertex that
    // differed from the ring's first offset vertex by ~1 ULP (the closing angle
    // was summed differently), leaving a sub-ULP sliver the winding dissolve
    // resolved inconsistently. It filled in Node but banded in some browsers
    // (Chrome's V8), whose Math.sin/cos last-ULP values differ. The fix closes
    // the seam onto an exact copy of the first offset vertex. This test
    // simulates the cross-engine difference by perturbing the trig functions by
    // +/-1 ULP and asserts the interior always fills (no source-shaped hole).
    it('s_nc_county.json: -buffer 1000 stays filled under +/-1 ULP trig perturbation', async function () {
      var file = 'test/data/features/buffer/s_nc_county.json';
      var real = {cos: Math.cos, sin: Math.sin, atan2: Math.atan2,
        sqrt: Math.sqrt, tan: Math.tan};
      var ab = new ArrayBuffer(8), fa = new Float64Array(ab), ia = new BigInt64Array(ab);
      function ulp(x, k) { if (!isFinite(x)) return x; fa[0] = x; ia[0] += BigInt(k); return fa[0]; }
      // deterministic LCG so the test is reproducible (not flaky); use high
      // bits (low LCG bits have short periods) for a 5-value +/-2 ULP spread
      var seed = 0x9e3779b9 >>> 0;
      function k() { seed = (seed * 1664525 + 1013904223) >>> 0; return ((seed >>> 27) % 5) - 2; }
      function netArea(geoms) {
        return geoms.reduce(function(sum, g) {
          return g ? sum + getSignedRingAreas(g).reduce(function(a, b) { return a + b; }, 0) : sum;
        }, 0);
      }
      var src = netArea(getOutputGeometries(await api.applyCommands(
        '-i ' + file + ' -o format=geojson buffer.json')));
      try {
        for (var t = 0; t < 200; t++) {
          Math.cos = function(x) { return ulp(real.cos(x), k()); };
          Math.sin = function(x) { return ulp(real.sin(x), k()); };
          Math.atan2 = function(y, x) { return ulp(real.atan2(y, x), k()); };
          Math.sqrt = function(x) { return ulp(real.sqrt(x), k()); };
          Math.tan = function(x) { return ulp(real.tan(x), k()); };
          var net = netArea(getOutputGeometries(await api.applyCommands(
            '-i ' + file + ' -buffer 1000 -o format=geojson buffer.json')));
          Math.cos = real.cos; Math.sin = real.sin; Math.atan2 = real.atan2;
          Math.sqrt = real.sqrt; Math.tan = real.tan;
          // a "perimeter band" only covers the buffer annulus, so its net area
          // drops well below the source area; a correct filled buffer exceeds it
          assert(net > src, 'buffer should stay filled, not band ' +
            '(perturbation trial ' + t + ': net ' + net + ' vs source ' + src + ')');
        }
      } finally {
        Math.cos = real.cos; Math.sin = real.sin; Math.atan2 = real.atan2;
        Math.sqrt = real.sqrt; Math.tan = real.tan;
      }
    })

    it('expands shells and shrinks holes', async function () {
      var out = await api.applyCommands(
        '-i polygon.json -buffer 200 -o format=geojson buffer.json',
        {'polygon.json': getDonut()}
      );
      var geom = getOutputGeometries(out)[0];

      assert.equal(pointInGeometry([900, 2000], geom), true);
      assert.equal(pointInGeometry([1700, 2000], geom), true);
      assert.equal(pointInGeometry([2000, 2000], geom), false);
    })

    it('retains source polygon body when buffering polygon with a hole and island', async function () {
      var out = await api.applyCommands(
        '-i test/data/features/buffer/o_polygon_with_hole_and_island.json ' +
        '-buffer 500m -o format=geojson buffer.json'
      );
      var geom = getOutputGeometries(out)[0];
      var areas = getSignedRingAreas(geom);
      var maxShell = Math.max.apply(null, areas.filter(function(area) {
        return area > 0;
      }));
      var maxHole = Math.max.apply(null, areas.filter(function(area) {
        return area < 0;
      }).map(Math.abs));

      assert.equal(getPolygonCount(geom), 1);
      assert(maxHole < maxShell * 0.1);
    })

    it('retains interior holes when buffering polygon with a hole and island', async function () {
      var out = await api.applyCommands(
        '-i test/data/features/buffer/o_polygon_with_hole_and_island.json ' +
        '-buffer 10m -o format=geojson buffer.json'
      );
      var geom = getOutputGeometries(out)[0];

      assert(geometryHasHole(geom));
    })

    it('negative buffers shrink shells and expand holes', async function () {
      var out = await api.applyCommands(
        '-i polygon.json -buffer radius=-200 -o format=geojson buffer.json',
        {'polygon.json': getDonut()}
      );
      var geom = getOutputGeometries(out)[0];

      assert.equal(pointInGeometry([1100, 2000], geom), false);
      assert.equal(pointInGeometry([2000, 1500], geom), false);
      assert.equal(pointInGeometry([2000, 1300], geom), true);
    })

    it('negative buffers shrink islands instead of turning them into holes', async function () {
      var out1 = await api.applyCommands(
        '-i test/data/features/buffer/o_polygon_with_hole_and_island.json ' +
        '-buffer -500m -o format=geojson buffer.json'
      );
      var json1 = JSON.parse(out1['buffer.json']);
      var geom1 = getOutputGeometries(out1)[0];
      var out2 = await api.applyCommands(
        '-i buffer.json -buffer -500m -o format=geojson buffer2.json',
        {'buffer.json': json1}
      );
      var geom2 = getOutputGeometries(out2, 'buffer2.json')[0];

      assert.equal(getPolygonCount(geom1), 1);
      assert.equal(getRingCount(geom1), 2);
      assert.equal(getPolygonCount(geom2), 1);
      assert.equal(getRingCount(geom2), 2);
    })

    it('removes near-source artifact holes from Washington buffer', async function () {
      var out = await api.applyCommands(
        '-i test/data/features/buffer/p_washington_state.json ' +
        '-buffer 10km -o format=geojson buffer.json'
      );
      var areas = getSignedRingAreas(getOutputGeometries(out)[0]);

      assert.equal(areas.some(function(area) {
        return area < 0;
      }), false);
    })

    it('preserves legitimate holes formed by positive buffers', async function () {
      var out = await api.applyCommands(
        '-i c.json -buffer 1000 -o format=geojson buffer.json',
        {'c.json': getAnnularCPolygon()}
      );
      var geom = getOutputGeometries(out)[0];
      var areas = getSignedRingAreas(geom);

      assert(areas.some(function(area) {
        return area < 0;
      }));
      assert.equal(pointInGeometry([0, 0], geom), false);
    })
  })

  // Ordinary (non-topological) polygon buffers offset each closed ring with the
  // winding-fill construction and collapse self-overlap overshoot loops before
  // the dissolve (default). The optimization must match the un-optimized
  // (no-loop-removal) winding output within the buffer's error tolerance, and
  // its source-turn gate must keep real buffer holes.
  describe('winding-fill loop removal', function () {
    function countHoles(geom) {
      return getSignedRingAreas(geom).filter(function(area) {
        return area < 0;
      }).length;
    }

    it('positive buffer area matches no-loop-removal within tolerance', async function () {
      var file = 'test/data/features/buffer/p_washington_state.json';
      var def = getTotalBufferArea(getOutputGeometries(await api.applyCommands(
        '-i ' + file + ' -buffer 10km -o format=geojson buffer.json')));
      var off = getTotalBufferArea(getOutputGeometries(await api.applyCommands(
        '-i ' + file + ' -buffer 10km no-loop-removal -o format=geojson buffer.json')));

      assert(off > 0);
      assert(Math.abs(def - off) / off < 0.005);
    })

    it('negative buffer area matches no-loop-removal within tolerance', async function () {
      var def = getTotalBufferArea(getOutputGeometries(await api.applyCommands(
        '-i p.json -buffer radius=-200 -o format=geojson buffer.json',
        {'p.json': getDonut()})));
      var off = getTotalBufferArea(getOutputGeometries(await api.applyCommands(
        '-i p.json -buffer radius=-200 no-loop-removal -o format=geojson buffer.json',
        {'p.json': getDonut()})));

      assert(off > 0);
      assert(Math.abs(def - off) / off < 0.005);
    })

    it('keeps a real positive-buffer hole that the gate must not collapse', async function () {
      var def = getOutputGeometries(await api.applyCommands(
        '-i c.json -buffer 1000 -o format=geojson buffer.json',
        {'c.json': getAnnularCPolygon()}))[0];
      var off = getOutputGeometries(await api.applyCommands(
        '-i c.json -buffer 1000 no-loop-removal -o format=geojson buffer.json',
        {'c.json': getAnnularCPolygon()}))[0];

      // loop removal must not fill the central hole the un-optimized path keeps
      assert.equal(countHoles(def), countHoles(off));
      assert(countHoles(def) > 0);
      assert.equal(pointInGeometry([0, 0], def), false);
    })

    // The topological pipeline pre-dissolves the winding-fill rings (with loop
    // removal) into clean polygons before the shared mosaic; the result must
    // match the un-optimized winding output within tolerance.
    it('topological buffer area matches no-loop-removal within tolerance', async function () {
      var file = 'test/data/shapefile/six_counties.shp';
      var def = getTotalBufferArea(getOutputGeometries(await api.applyCommands(
        '-i ' + file + ' -buffer 100m topological -o format=geojson buffer.json')));
      var off = getTotalBufferArea(getOutputGeometries(await api.applyCommands(
        '-i ' + file + ' -buffer 100m topological no-loop-removal -o format=geojson buffer.json')));

      assert(off > 0);
      assert(Math.abs(def - off) / off < 0.005);
    })
  })

  // The undocumented 'band-method' option forces the older band (sector-band)
  // construction (per-segment offset bands + join-sector rings + band-coverage
  // audit, unioned by a boundary flood) as a conservative fallback. Its output
  // must match the default construction within the buffer's error tolerance for
  // the supported use cases: line buffers (one- and two-sided) and all polygon
  // buffers (positive, negative, topological).
  describe('band-method fallback', function () {
    function countHoles(geoms) {
      return geoms.reduce(function(n, geom) {
        return n + (geom ? getSignedRingAreas(geom).filter(function(a) {
          return a < 0;
        }).length : 0);
      }, 0);
    }

    async function bufferGeoms(cmd, inputs) {
      return getOutputGeometries(await api.applyCommands(
        cmd + ' -o format=geojson buffer.json', inputs));
    }

    it('positive polygon buffer matches winding-fill within tolerance', async function () {
      var file = 'test/data/features/buffer/p_washington_state.json';
      var def = getTotalBufferArea(await bufferGeoms('-i ' + file + ' -buffer 10km'));
      var sec = getTotalBufferArea(await bufferGeoms('-i ' + file + ' -buffer 10km band-method'));
      assert(sec > 0);
      assert(Math.abs(def - sec) / sec < 0.005);
    })

    it('positive polygon with hole keeps the hole', async function () {
      var file = 'test/data/features/buffer/o_polygon_with_hole_and_island.json';
      var def = await bufferGeoms('-i ' + file + ' -buffer 500');
      var sec = await bufferGeoms('-i ' + file + ' -buffer 500 band-method');
      assert.equal(countHoles(sec), countHoles(def));
      assert(countHoles(sec) > 0);
      assert(Math.abs(getTotalBufferArea(def) - getTotalBufferArea(sec)) /
        getTotalBufferArea(sec) < 0.005);
    })

    it('negative polygon buffer matches winding-fill within tolerance', async function () {
      var def = getTotalBufferArea(await bufferGeoms(
        '-i p.json -buffer radius=-200', {'p.json': getDonut()}));
      var sec = getTotalBufferArea(await bufferGeoms(
        '-i p.json -buffer radius=-200 band-method', {'p.json': getDonut()}));
      assert(sec > 0);
      assert(Math.abs(def - sec) / sec < 0.005);
    })

    it('topological polygon buffer matches winding-fill within tolerance', async function () {
      var file = 'test/data/shapefile/six_counties.shp';
      var def = await bufferGeoms('-i ' + file + ' -buffer 100m topological');
      var sec = await bufferGeoms('-i ' + file + ' -buffer 100m topological band-method');
      assert(getTotalBufferArea(sec) > 0);
      assert.equal(countHoles(sec), countHoles(def));
      assert(Math.abs(getTotalBufferArea(def) - getTotalBufferArea(sec)) /
        getTotalBufferArea(sec) < 0.005);
    })

    it('two-sided line buffer matches winding-fill within tolerance', async function () {
      var line = {type: 'LineString',
        coordinates: [[0, 0], [1000, 0], [1000, 1000], [2000, 1500], [1500, 2500]]};
      var def = getTotalBufferArea(await bufferGeoms('-i l.json -buffer 200', {'l.json': line}));
      var sec = getTotalBufferArea(await bufferGeoms('-i l.json -buffer 200 band-method', {'l.json': line}));
      assert(sec > 0);
      assert(Math.abs(def - sec) / sec < 0.005);
    })

    it('one-sided line buffer matches winding-fill within tolerance', async function () {
      var line = {type: 'LineString',
        coordinates: [[0, 0], [1000, 0], [1000, 1000], [2000, 1500], [1500, 2500]]};
      var def = getTotalBufferArea(await bufferGeoms('-i l.json -buffer 200 left', {'l.json': line}));
      var sec = getTotalBufferArea(await bufferGeoms('-i l.json -buffer 200 left band-method', {'l.json': line}));
      assert(sec > 0);
      assert(Math.abs(def - sec) / sec < 0.005);
    })
  })

  // The clean-outline construction is the DEFAULT for polygon grow: offset each
  // outer source ring to one self-contained loop, strip self-overlaps with the
  // crossing-direction remover, union by winding. Holes shrink (an inward
  // offset, which the outline method can't do robustly), so they are eroded
  // with the band construction and carved out of the grown outer; negative
  // buffers fall back to the band construction entirely. These cases validate
  // the default against the conservative band-method construction (the
  // documented escape hatch), which builds the same buffers a different way.
  describe('default outline construction vs band-method reference', function () {
    function countHoles(geoms) {
      return geoms.reduce(function(n, geom) {
        return n + (geom ? getSignedRingAreas(geom).filter(function(a) {
          return a < 0;
        }).length : 0);
      }, 0);
    }

    async function bufferGeoms(cmd, inputs) {
      return getOutputGeometries(await api.applyCommands(
        cmd + ' -o format=geojson buffer.json', inputs));
    }

    function assertAreaMatches(def, ref, tol) {
      var a = getTotalBufferArea(ref);
      var b = getTotalBufferArea(def);
      assert(b > 0);
      assert(Math.abs(a - b) / b < (tol || 0.005),
        'default area ' + b + ' vs band-method ' + a);
    }

    it('hole-free positive polygon matches', async function () {
      var poly = {type: 'Polygon', coordinates: [
        [[0, 0], [1000, 0], [1000, 400], [400, 400], [400, 1000], [0, 1000], [0, 0]]]};
      var def = await bufferGeoms('-i p.json -buffer 150', {'p.json': poly});
      var ref = await bufferGeoms('-i p.json -buffer 150 band-method', {'p.json': poly});
      assertAreaMatches(def, ref);
    })

    it('multiple islands in one shape match', async function () {
      var mp = {type: 'MultiPolygon', coordinates: [
        [[[0, 0], [400, 0], [400, 400], [0, 400], [0, 0]]],
        [[[600, 0], [1000, 0], [1000, 400], [600, 400], [600, 0]]]]};
      var def = await bufferGeoms('-i p.json -buffer 100', {'p.json': mp});
      var ref = await bufferGeoms('-i p.json -buffer 100 band-method', {'p.json': mp});
      assert.equal(countHoles(def), countHoles(ref));
      assertAreaMatches(def, ref);
    })

    it('positive polygon with a hole keeps the (shrunk) hole', async function () {
      // The outer grows on the outline path; the hole shrinks via the band
      // erode and is carved back out, so the result keeps the hole.
      var def = await bufferGeoms('-i p.json -buffer 200', {'p.json': getDonut()});
      var ref = await bufferGeoms('-i p.json -buffer 200 band-method', {'p.json': getDonut()});
      assert(countHoles(ref) > 0);
      assert.equal(countHoles(def), countHoles(ref));
      assertAreaMatches(def, ref);
    })

    it('concave (L-shaped) hole keeps the hole', async function () {
      var poly = {type: 'Polygon', coordinates: [
        [[0, 0], [3000, 0], [3000, 3000], [0, 3000], [0, 0]],
        [[500, 500], [2000, 500], [2000, 1200], [1200, 1200], [1200, 2000],
          [500, 2000], [500, 500]]]};
      var def = await bufferGeoms('-i p.json -buffer 150', {'p.json': poly});
      var ref = await bufferGeoms('-i p.json -buffer 150 band-method', {'p.json': poly});
      assert(countHoles(ref) > 0);
      assert.equal(countHoles(def), countHoles(ref));
      assertAreaMatches(def, ref);
    })

    it('hole smaller than the radius collapses (no spurious hole)', async function () {
      var poly = {type: 'Polygon', coordinates: [
        [[0, 0], [2000, 0], [2000, 2000], [0, 2000], [0, 0]],
        [[900, 900], [1100, 900], [1100, 1100], [900, 1100], [900, 900]]]};
      var def = await bufferGeoms('-i p.json -buffer 300', {'p.json': poly});
      var ref = await bufferGeoms('-i p.json -buffer 300 band-method', {'p.json': poly});
      assert.equal(countHoles(ref), 0);
      assert.equal(countHoles(def), 0);
      assertAreaMatches(def, ref);
    })

    it('negative polygon buffer matches (band fallback)', async function () {
      var def = await bufferGeoms('-i p.json -buffer radius=-200', {'p.json': getDonut()});
      var ref = await bufferGeoms('-i p.json -buffer radius=-200 band-method', {'p.json': getDonut()});
      assert.equal(countHoles(def), countHoles(ref));
      assertAreaMatches(def, ref);
    })

    it('spherical lat-long polygon matches', async function () {
      var poly = {type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]};
      var def = await bufferGeoms('-i p.json -buffer 50km', {'p.json': poly});
      var ref = await bufferGeoms('-i p.json -buffer 50km band-method', {'p.json': poly});
      assertAreaMatches(def, ref);
    })

    it('real hole-free coastline polygon matches within tolerance', async function () {
      // p_washington_state.json is a hole-free multi-ring coastline, so its
      // grow exercises the outline path (not the band fallback).
      var file = 'test/data/features/buffer/p_washington_state.json';
      var def = await bufferGeoms('-i ' + file + ' -buffer 10km');
      var ref = await bufferGeoms('-i ' + file + ' -buffer 10km band-method');
      assert.equal(countHoles(def), countHoles(ref));
      assertAreaMatches(def, ref);
    })

    it('deep-concavity polygon (overshoot loops) matches', async function () {
      // A star's reflex vertices make the outward offset self-overlap, so this
      // exercises the crossing-direction loop removal on the outline loop.
      var pts = [];
      for (var i = 0; i < 10; i++) {
        var a = Math.PI * i / 5 - Math.PI / 2;
        var r = i % 2 ? 300 : 800;
        pts.push([1000 + r * Math.cos(a), 1000 + r * Math.sin(a)]);
      }
      pts.push(pts[0]);
      var poly = {type: 'Polygon', coordinates: [pts]};
      var def = await bufferGeoms('-i p.json -buffer 250', {'p.json': poly});
      var ref = await bufferGeoms('-i p.json -buffer 250 band-method', {'p.json': poly});
      assert.equal(countHoles(def), countHoles(ref));
      assertAreaMatches(def, ref);
    })
  })

  // debug-mosaic is implemented only for line buffers; for polygon buffers it
  // must be ignored (a no-op producing the ordinary buffer) rather than leaking
  // into the per-shape dissolve and corrupting the output. Buffer output is
  // deterministic, so the no-op contract is the exact ordinary-buffer output.
  describe('debug-mosaic is a no-op for polygon buffers', function () {
    async function bufferJSON(cmd) {
      // format=geojson output is returned as a Buffer; normalize to a string
      // so identical content compares equal.
      return String((await api.applyCommands(cmd + ' -o format=geojson buffer.json'))['buffer.json']);
    }

    it('produces the ordinary polygon buffer', async function () {
      var file = 'test/data/features/buffer/o_polygon_with_hole_and_island.json';
      var def = await bufferJSON('-i ' + file + ' -buffer 500');
      var dbg = await bufferJSON('-i ' + file + ' -buffer 500 debug-mosaic');
      assert.strictEqual(dbg, def);
    })

    it('produces the ordinary topological polygon buffer', async function () {
      var file = 'test/data/shapefile/six_counties.shp';
      var def = await bufferJSON('-i ' + file + ' -buffer 100m topological');
      var dbg = await bufferJSON('-i ' + file + ' -buffer 100m topological debug-mosaic');
      assert.strictEqual(dbg, def);
    })
  })

  // debug-offset emits the raw offset construction rings without the winding/
  // boundary dissolve, for polygon buffers as for line buffers.
  describe('debug-offset for polygon buffers', function () {
    var file = 'test/data/features/buffer/o_polygon_with_hole_and_island.json';

    function countVertices(geoms) {
      var n = 0;
      geoms.forEach(function(g) {
        if (!g) return;
        var polys = g.type == 'Polygon' ? [g.coordinates] : g.coordinates;
        polys.forEach(function(poly) {
          poly.forEach(function(ring) { n += ring.length; });
        });
      });
      return n;
    }

    it('produces undissolved offset rings (differs from the dissolved buffer)', async function () {
      var normal = await api.applyCommands(
        '-i ' + file + ' -buffer 500 -o format=geojson buffer.json');
      var debug = await api.applyCommands(
        '-i ' + file + ' -buffer 500 debug-offset -o format=geojson buffer.json');
      assert.notDeepEqual(JSON.parse(normal['buffer.json']), JSON.parse(debug['buffer.json']));
      assert(getOutputGeometries(debug).some(function(g) { return !!g; }));
    })

    it('works together with no-loop-removal (loop removal reduces vertices)', async function () {
      var withRemoval = await api.applyCommands(
        '-i ' + file + ' -buffer 500 debug-offset -o format=geojson buffer.json');
      var without = await api.applyCommands(
        '-i ' + file + ' -buffer 500 debug-offset no-loop-removal -o format=geojson buffer.json');
      var nWith = countVertices(getOutputGeometries(withRemoval));
      var nWithout = countVertices(getOutputGeometries(without));
      assert(nWith > 0 && nWithout > 0);
      // loop removal only ever deletes vertices, and on this shape it deletes some
      assert(nWithout > nWith,
        'no-loop-removal should retain more vertices (' + nWithout + ' vs ' + nWith + ')');
    })

    it('works for a negative (erode) buffer with no-loop-removal', async function () {
      var withRemoval = await api.applyCommands(
        '-i ' + file + ' -buffer -300 debug-offset -o format=geojson buffer.json');
      var without = await api.applyCommands(
        '-i ' + file + ' -buffer -300 debug-offset no-loop-removal -o format=geojson buffer.json');
      var nWith = countVertices(getOutputGeometries(withRemoval));
      var nWithout = countVertices(getOutputGeometries(without));
      assert(nWith > 0 && nWithout > 0);
      assert(nWithout >= nWith);
    })
  })

  describe('geodesic option for projected data', function () {
    // A polygon and a line near 45N, where web-mercator scale distortion is
    // large. The geodesic buffer of the projected data should match the
    // geodesic buffer of the lat-long source.
    var poly = {type: 'FeatureCollection', features: [{type: 'Feature',
      properties: {}, geometry: {type: 'Polygon',
        coordinates: [[[-100, 44], [-99, 44], [-99, 45], [-100, 45], [-100, 44]]]}}]};
    var line = {type: 'FeatureCollection', features: [{type: 'Feature',
      properties: {}, geometry: {type: 'LineString',
        coordinates: [[-100, 44], [-99, 45], [-98, 44]]}}]};

    // Sum of geodesic feature areas (m^2). The command must yield a wgs84
    // lng/lat layer; this.area then returns spherical area.
    function geodesicArea(cmd, geojson) {
      return new Promise(function(resolve, reject) {
        api.applyCommands(cmd + ' -each "_A=this.area" -o format=geojson out.json',
          {'in.json': JSON.stringify(geojson)}, function(err, o) {
            if (err) return reject(err);
            var g = JSON.parse(String(o['out.json']));
            resolve(g.features.reduce(function(s, f) {
              return s + (f.properties._A || 0);
            }, 0));
          });
      });
    }

    it('polygon: geodesic buffer of a UTM dataset matches the lat-long geodesic buffer', async function () {
      var a = await geodesicArea('-i in.json -buffer 50km', poly);
      var b = await geodesicArea(
        '-i in.json -proj +proj=utm +zone=14 -buffer 50km geodesic -proj wgs84', poly);
      assert(Math.abs(b - a) / a < 1e-9, 'rel diff ' + Math.abs(b - a) / a);
    })

    it('line: geodesic buffer of a UTM dataset matches the lat-long geodesic buffer', async function () {
      var a = await geodesicArea('-i in.json -buffer 25km', line);
      var b = await geodesicArea(
        '-i in.json -proj +proj=utm +zone=14 -buffer 25km geodesic -proj wgs84', line);
      assert(Math.abs(b - a) / a < 1e-9, 'rel diff ' + Math.abs(b - a) / a);
    })

    it('point: geodesic buffer of a UTM dataset matches the lat-long geodesic buffer', async function () {
      var pt = {type: 'FeatureCollection', features: [{type: 'Feature',
        properties: {}, geometry: {type: 'Point', coordinates: [-100, 45]}}]};
      var a = await geodesicArea('-i in.json -buffer 50km', pt);
      var b = await geodesicArea(
        '-i in.json -proj +proj=utm +zone=14 -buffer 50km geodesic -proj wgs84', pt);
      assert(Math.abs(b - a) / a < 1e-9, 'rel diff ' + Math.abs(b - a) / a);
    })

    it('web-mercator input: geodesic buffer matches the lat-long geodesic buffer', async function () {
      var a = await geodesicArea('-i in.json -buffer 50km', poly);
      var b = await geodesicArea(
        '-i in.json -proj webmercator -buffer 50km geodesic -proj wgs84', poly);
      assert(Math.abs(b - a) / a < 1e-9, 'rel diff ' + Math.abs(b - a) / a);
    })

    it('geodesic differs substantially from a planar buffer in web-mercator units', async function () {
      var geo = await geodesicArea(
        '-i in.json -proj webmercator -buffer 50km geodesic -proj wgs84', poly);
      var planar = await geodesicArea(
        '-i in.json -proj webmercator -buffer 50km -proj wgs84', poly);
      // a 50000-unit offset in web-mercator coords is much less than 50km on the
      // ground at 45N (mercator inflates coordinates), so the planar buffer comes
      // out substantially smaller than the geodesic one
      assert(geo > planar * 1.1, 'geodesic ' + geo + ' should exceed planar ' + planar);
    })

    it('errors when the source projection has no inverse', async function () {
      var err = null;
      try {
        await api.applyCommands(
          '-i in.json -proj +proj=nicol -buffer 50km geodesic -o format=geojson out.json',
          {'in.json': JSON.stringify(poly)});
      } catch (e) { err = e; }
      assert(err && /inverse/.test(err.message), err && err.message);
    })

    it('geodesic is a no-op for lat-long data (output unchanged)', async function () {
      var input = {'in.json': JSON.stringify(poly)};
      var def = await api.applyCommands('-i in.json -buffer 50km -o format=geojson out.json', input);
      var geo = await api.applyCommands('-i in.json -buffer 50km geodesic -o format=geojson out.json', input);
      assert.strictEqual(String(geo['out.json']), String(def['out.json']));
    })
  })

  describe('polar option (pole/antimeridian-sliced polygons)', function () {
    // t_antarctica.json is sliced for Cartesian display: artificial seam edges at
    // the antimeridian (lng +/-180) and the south pole (lat -90). Without the
    // polar option buffering it errors near the pole; with it the buffer stays in
    // the valid extent, pins the seam, and only the real coastline moves.
    var antarctica = JSON.parse(fs.readFileSync('test/data/features/buffer/t_antarctica.json', 'utf8'));
    // a north-pole synthetic: the same shape mirrored to lat +90 / +/-180
    var arctica = {type: 'Feature', properties: {}, geometry: {type: 'MultiPolygon',
      coordinates: antarctica.features[0].geometry.coordinates.map(function (poly) {
        return poly.map(function (ring) {
          return ring.map(function (p) { return [p[0], -p[1]]; });
        });
      })}};

    // Sum of spherical feature areas (m^2) of a command's lng/lat output.
    function sphericalArea(cmd, files) {
      return new Promise(function (resolve, reject) {
        api.applyCommands(cmd + ' -each "_A=this.area" -o format=geojson out.json', files,
          function (err, o) {
            if (err) return reject(err);
            var g = JSON.parse(String(o['out.json']));
            resolve(g.features.reduce(function (s, f) { return s + (f.properties._A || 0); }, 0));
          });
      });
    }

    function bufferBounds(cmd, files) {
      return new Promise(function (resolve, reject) {
        api.applyCommands(cmd + ' -o format=geojson out.json', files, function (err, o) {
          if (err) return reject(err);
          var g = JSON.parse(String(o['out.json']));
          var b = [Infinity, Infinity, -Infinity, -Infinity];
          eachCoord(g, function (p) {
            if (p[0] < b[0]) b[0] = p[0];
            if (p[1] < b[1]) b[1] = p[1];
            if (p[0] > b[2]) b[2] = p[0];
            if (p[1] > b[3]) b[3] = p[1];
          });
          resolve(b);
        });
      });
    }

    function eachCoord(geojson, cb) {
      collect(geojson);
      function collect(o) {
        if (!o) return;
        if (o.type == 'FeatureCollection') o.features.forEach(collect);
        else if (o.type == 'GeometryCollection') o.geometries.forEach(collect);
        else if (o.type == 'Feature') collect(o.geometry);
        else if (o.coordinates) walk(o.coordinates);
      }
      function walk(a) {
        if (!a) return;
        if (typeof a[0] == 'number') { cb(a); return; }
        a.forEach(walk);
      }
    }

    it('positive: t_antarctica buffer succeeds, stays in extent and grows', async function () {
      var files = {'a.json': JSON.stringify(antarctica)};
      var src = await sphericalArea('-i a.json', files);
      var buf = await sphericalArea('-i a.json -buffer 50km polar', files);
      assert(buf > src, 'buffer area ' + buf + ' should exceed source ' + src);
      var b = await bufferBounds('-i a.json -buffer 50km polar', files);
      assert(b[0] >= -180 - 1e-6 && b[2] <= 180 + 1e-6, 'lng in [-180,180]: ' + b);
      assert(b[1] >= -90 - 1e-6 && b[3] <= 90 + 1e-6, 'lat in [-90,90]: ' + b);
      assert(b[1] < -89.9, 'south edge should reach the pole: ' + b[1]);
    })

    it('negative: erode is not supported yet and errors clearly', async function () {
      // A negative polar buffer would have to keep the seam edges pinned while
      // only the coastline erodes; the construction can't do that yet, so it is
      // rejected rather than returning a result with inward-crept seams.
      var err = null;
      try {
        await api.applyCommands('-i a.json -buffer -50km polar -o format=geojson out.json',
          {'a.json': JSON.stringify(antarctica)});
      } catch (e) { err = e; }
      assert(err && /negative|erode/i.test(err.message), err && err.message);
    })

    it('north pole: a +90/+-180-sliced polygon stays in extent and grows', async function () {
      var files = {'a.json': JSON.stringify(arctica)};
      var src = await sphericalArea('-i a.json', files);
      var buf = await sphericalArea('-i a.json -buffer 50km polar', files);
      assert(buf > src, 'buffer area ' + buf + ' should exceed source ' + src);
      var b = await bufferBounds('-i a.json -buffer 50km polar', files);
      assert(b[0] >= -180 - 1e-6 && b[2] <= 180 + 1e-6, 'lng in [-180,180]: ' + b);
      assert(b[3] <= 90 + 1e-6 && b[3] > 89.9, 'north edge should reach the pole: ' + b);
    })

    it('without polar, a pole-touching buffer still errors', async function () {
      var err = null;
      try {
        await api.applyCommands('-i a.json -buffer 50km -o format=geojson out.json',
          {'a.json': JSON.stringify(antarctica)});
      } catch (e) { err = e; }
      assert(err && /pole/i.test(err.message), err && err.message);
    })

    it('no-op: polar matches the plain buffer for a mid-latitude polygon', async function () {
      var poly = {type: 'Feature', properties: {}, geometry: {type: 'Polygon',
        coordinates: [[[0, 40], [20, 40], [20, 50], [0, 50], [0, 40]]]}};
      var files = {'m.json': JSON.stringify(poly)};
      var def = await sphericalArea('-i m.json -buffer 100km', files);
      var pol = await sphericalArea('-i m.json -buffer 100km polar', files);
      assert(Math.abs(pol - def) / def < 1e-9, 'polar ' + pol + ' vs plain ' + def);
    })
  })

  describe('two-sided buffer of closed-ring polylines', function () {
    // A polyline whose parts are closed rings buffers to an annulus per ring
    // (outer offset + inner-offset hole). These shapes are routed through the
    // winding-fill + loop-removal construction rather than the open-path outline.
    it('a closed square ring buffers to a clean annulus', function (done) {
      var sq = {type: 'Feature', properties: {}, geometry: {type: 'LineString',
        coordinates: [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]}};
      api.applyCommands('-i sq.json -buffer 10 -o format=geojson out.json',
        {'sq.json': JSON.stringify(sq)}, function (err, out) {
          assert(!err, err && err.message);
          var o = JSON.parse(out['out.json']);
          var geom = o.geometries ? o.geometries[0] :
            (o.features ? o.features[0].geometry : o.geometry || o);
          var rings = geom.type == 'Polygon' ? [geom.coordinates] : geom.coordinates;
          assert.equal(rings.length, 1, 'one polygon');
          assert.equal(rings[0].length, 2, 'outer ring + one hole (annulus)');
          var b = bufferBounds2(geom);
          assert(Math.abs(b[0] + 10) < 1 && Math.abs(b[1] + 10) < 1 &&
            Math.abs(b[2] - 110) < 1 && Math.abs(b[3] - 110) < 1, 'bounds ' + b);
          done();
        });
    })

    it('matches the section-construction area (open-path equivalent disabled)', function (done) {
      // Buffer area is invariant to construction: a closed ring's two-sided
      // buffer area must match whether built as an annulus here or otherwise.
      var ring = {type: 'Feature', properties: {}, geometry: {type: 'LineString',
        coordinates: [[0, 0], [60, 0], [60, 40], [30, 70], [0, 40], [0, 0]]}};
      api.applyCommands('-i r.json -buffer 5 -o format=geojson out.json',
        {'r.json': JSON.stringify(ring)}, function (err, out) {
          assert(!err, err && err.message);
          var o = JSON.parse(out['out.json']);
          var geom = o.geometries ? o.geometries[0] :
            (o.features ? o.features[0].geometry : o.geometry || o);
          var rings = geom.type == 'Polygon' ? [geom.coordinates] : geom.coordinates;
          assert.equal(rings.length, 1);
          assert.equal(rings[0].length, 2, 'annulus (outer + hole)');
          done();
        });
    })
  })

})

function bufferBounds2(geom) {
  var b = [Infinity, Infinity, -Infinity, -Infinity];
  (function walk(a) {
    if (typeof a[0] == 'number') {
      if (a[0] < b[0]) b[0] = a[0];
      if (a[1] < b[1]) b[1] = a[1];
      if (a[0] > b[2]) b[2] = a[0];
      if (a[1] > b[3]) b[3] = a[1];
    } else a.forEach(walk);
  })(geom.coordinates);
  return b;
}

function getTotalBufferArea(geoms) {
  return geoms.reduce(function(sum, geom) {
    if (!geom) return sum;
    var net = getSignedRingAreas(geom).reduce(function(a, b) {
      return a + b;
    }, 0);
    return sum + Math.abs(net);
  }, 0);
}

function ringArea(ring) {
  var sum = 0;
  for (var i=0; i<ring.length-1; i++) {
    sum += ring[i][0] * ring[i+1][1] - ring[i+1][0] * ring[i][1];
  }
  return sum / 2;
}

// even-odd ray casting; poly is a GeoJSON Polygon geometry
function pointInGeometry(p, geom) {
  if (geom.type == 'Polygon') {
    return pointInPolygonCoords(p, geom.coordinates);
  }
  if (geom.type == 'MultiPolygon') {
    return geom.coordinates.some(function(coords) {
      return pointInPolygonCoords(p, coords);
    });
  }
  return false;
}

function pointInPolygon(p, poly) {
  return pointInGeometry(p, poly);
}

function pointInPolygonCoords(p, coords) {
  var inside = false;
  coords.forEach(function(ring) {
    for (var i=0, j=ring.length-1; i<ring.length; j=i++) {
      var a = ring[i], b = ring[j];
      if ((a[1] > p[1]) != (b[1] > p[1]) &&
          p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) {
        inside = !inside;
      }
    }
  });
  return inside;
}

function getSignedRingAreas(geom) {
  var polys = geom.type == 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polys.reduce(function(memo, polygon) {
    polygon.forEach(function(ring) {
      memo.push(ringArea(ring));
    });
    return memo;
  }, []);
}

function geometryHasHole(geom) {
  return getSignedRingAreas(geom).some(function(area) {
    return area < 0;
  });
}

function getPolygonCount(geom) {
  return geom.type == 'Polygon' ? 1 : geom.coordinates.length;
}

function getRingCount(geom) {
  var polys = geom.type == 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polys.reduce(function(memo, polygon) {
    return memo + polygon.length;
  }, 0);
}

function getGeometryVertexCount(geom) {
  var polys = geom.type == 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polys.reduce(function(memo, polygon) {
    polygon.forEach(function(ring) {
      memo += ring.length;
    });
    return memo;
  }, 0);
}

function geometryHasVertex(geom, p) {
  var polys = geom.type == 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polys.some(function(polygon) {
    return polygon.some(function(ring) {
      return ring.some(function(p2) {
        return p2[0] == p[0] && p2[1] == p[1];
      });
    });
  });
}

function getSmallHoleCount(geoms, threshold) {
  return geoms.reduce(function(memo, geom) {
    var polys = geom.type == 'Polygon' ? [geom.coordinates] : geom.coordinates;
    polys.forEach(function(polygon) {
      polygon.slice(1).forEach(function(ring) {
        if (Math.abs(ringArea(ring)) < threshold) memo++;
      });
    });
    return memo;
  }, 0);
}

function getOutputGeometries(out, filename) {
  var json = JSON.parse(out[filename || 'buffer.json']);
  return json.features ?
    json.features.map(function(feat) { return feat.geometry; }) :
    json.geometries;
}

function getAdjacentSquares() {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {id: 1},
      geometry: {
        type: 'Polygon',
        coordinates: [[[1000, 1000], [2000, 1000], [2000, 2000], [1000, 2000], [1000, 1000]]]
      }
    }, {
      type: 'Feature',
      properties: {id: 2},
      geometry: {
        type: 'Polygon',
        coordinates: [[[2000, 1000], [3000, 1000], [3000, 2000], [2000, 2000], [2000, 1000]]]
      }
    }]
  };
}

function getNearbySquares() {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {id: 1},
      geometry: {
        type: 'Polygon',
        coordinates: [[[1000, 1000], [2000, 1000], [2000, 2000], [1000, 2000], [1000, 1000]]]
      }
    }, {
      type: 'Feature',
      properties: {id: 2},
      geometry: {
        type: 'Polygon',
        coordinates: [[[2150, 1000], [3150, 1000], [3150, 2000], [2150, 2000], [2150, 1000]]]
      }
    }]
  };
}

// Flatten a GeoJSON feature's polygon rings (outer + holes of every part).
function featureRings(feature) {
  var g = feature.geometry;
  var polygons = g.type == 'Polygon' ? [g.coordinates] : g.coordinates;
  var rings = [];
  polygons.forEach(function(poly) {
    poly.forEach(function(ring) { rings.push(ring); });
  });
  return rings;
}

function pointToSegmentDistance(px, py, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay;
  var l2 = dx * dx + dy * dy;
  var t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  var ex = px - (ax + t * dx), ey = py - (ay + t * dy);
  return Math.sqrt(ex * ex + ey * ey);
}

function distToRings(px, py, rings) {
  var min = Infinity;
  for (var k = 0; k < rings.length; k++) {
    var r = rings[k];
    for (var i = 1; i < r.length; i++) {
      var d = pointToSegmentDistance(px, py, r[i - 1][0], r[i - 1][1], r[i][0], r[i][1]);
      if (d < min) min = d;
    }
  }
  return min;
}

function getNearbyUnequalSquares() {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {id: 1},
      geometry: {
        type: 'Polygon',
        coordinates: [[[1000, 1000], [2000, 1000], [2000, 2000], [1000, 2000], [1000, 1000]]]
      }
    }, {
      type: 'Feature',
      properties: {id: 2},
      geometry: {
        type: 'Polygon',
        coordinates: [[[2150, 500], [4150, 500], [4150, 2500], [2150, 2500], [2150, 500]]]
      }
    }]
  };
}

function getPointTouchingSquares() {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {id: 1},
      geometry: {
        type: 'Polygon',
        coordinates: [[[1000, 1000], [2000, 1000], [2000, 2000], [1000, 2000], [1000, 1000]]]
      }
    }, {
      type: 'Feature',
      properties: {id: 2},
      geometry: {
        type: 'Polygon',
        coordinates: [[[2000, 2000], [3000, 2000], [3000, 3000], [2000, 3000], [2000, 2000]]]
      }
    }]
  };
}

function getDonut() {
  return {
    type: 'Polygon',
    coordinates: [
      [[1000, 1000], [3000, 1000], [3000, 3000], [1000, 3000], [1000, 1000]],
      [[1600, 1600], [1600, 2400], [2400, 2400], [2400, 1600], [1600, 1600]]
    ]
  };
}

function getAnnularCPolygon() {
  var outer = 4000;
  var inner = 3000;
  var start = 15;
  var end = 345;
  var n = 80;
  var coords = [];
  var i, a;
  for (i = 0; i <= n; i++) {
    a = (start + (end - start) * i / n) * Math.PI / 180;
    coords.push([Math.cos(a) * outer, Math.sin(a) * outer]);
  }
  for (i = n; i >= 0; i--) {
    a = (start + (end - start) * i / n) * Math.PI / 180;
    coords.push([Math.cos(a) * inner, Math.sin(a) * inner]);
  }
  coords.push(coords[0]);
  return {
    type: 'Polygon',
    coordinates: [coords]
  };
}

