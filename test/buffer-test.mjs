
import api from '../mapshaper.js';
import assert from 'assert';


describe('mapshaper-buffer.js', function () {

  describe('undo capture', function () {
    // Buffering builds a throwaway dataset (offset geometry, intersection cuts,
    // dissolve, topology rebuild) that never enters the catalog, then merges it
    // into the target dataset. When a GUI undo transaction is active, those
    // in-place mutations must not be captured -- doing so records large
    // intermediate arc collections and makes undo of a buffer command
    // pathologically slow. Only the target dataset + replaced layer should be
    // captured (the dataset unit holds the previous arcs by reference).
    function runBufferWithUndo(geojson, command) {
      var I = api.internal;
      var dataset = I.importGeoJSON(geojson, {});
      I.buildTopology(dataset);
      var catalog = new I.Catalog();
      catalog.addDataset(dataset);
      var job = new I.Job(catalog);
      var origArcs = dataset.arcs;
      var origShapes = JSON.stringify(dataset.layers[0].shapes);
      var tx = new I.UndoTransaction(command);
      I.setActiveUndoTransaction(tx);
      return new Promise(function(resolve, reject) {
        I.runParsedCommands(I.parseCommands(command), job, function(err) {
          I.clearActiveUndoTransaction(tx);
          if (err) return reject(err);
          resolve({dataset: dataset, origArcs: origArcs, origShapes: origShapes, tx: tx});
        });
      });
    }

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

    it('topological buffer overlaps are assigned to the larger source polygon', async function () {
      var out = await api.applyCommands(
        '-i polygons.json -buffer 250 topological -o format=geojson buffer.json',
        {'polygons.json': getNearbyUnequalSquares()}
      );
      var geoms = getOutputGeometries(out);

      assert.equal(pointInGeometry([2075, 1500], geoms[0]), false);
      assert.equal(pointInGeometry([2075, 1500], geoms[1]), true);
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

  // The undocumented 'sector-band' option forces the older non-winding-fill
  // construction (per-segment offset bands + join-sector rings + band-coverage
  // audit, unioned by a boundary flood) as a conservative fallback. Its output
  // must match the default winding-fill construction within the buffer's error
  // tolerance for the supported use cases: two-sided line buffers and all
  // polygon buffers (positive, negative, topological).
  describe('sector-band fallback', function () {
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
      var sec = getTotalBufferArea(await bufferGeoms('-i ' + file + ' -buffer 10km sector-band'));
      assert(sec > 0);
      assert(Math.abs(def - sec) / sec < 0.005);
    })

    it('positive polygon with hole keeps the hole', async function () {
      var file = 'test/data/features/buffer/o_polygon_with_hole_and_island.json';
      var def = await bufferGeoms('-i ' + file + ' -buffer 500');
      var sec = await bufferGeoms('-i ' + file + ' -buffer 500 sector-band');
      assert.equal(countHoles(sec), countHoles(def));
      assert(countHoles(sec) > 0);
      assert(Math.abs(getTotalBufferArea(def) - getTotalBufferArea(sec)) /
        getTotalBufferArea(sec) < 0.005);
    })

    it('negative polygon buffer matches winding-fill within tolerance', async function () {
      var def = getTotalBufferArea(await bufferGeoms(
        '-i p.json -buffer radius=-200', {'p.json': getDonut()}));
      var sec = getTotalBufferArea(await bufferGeoms(
        '-i p.json -buffer radius=-200 sector-band', {'p.json': getDonut()}));
      assert(sec > 0);
      assert(Math.abs(def - sec) / sec < 0.005);
    })

    it('topological polygon buffer matches winding-fill within tolerance', async function () {
      var file = 'test/data/shapefile/six_counties.shp';
      var def = await bufferGeoms('-i ' + file + ' -buffer 100m topological');
      var sec = await bufferGeoms('-i ' + file + ' -buffer 100m topological sector-band');
      assert(getTotalBufferArea(sec) > 0);
      assert.equal(countHoles(sec), countHoles(def));
      assert(Math.abs(getTotalBufferArea(def) - getTotalBufferArea(sec)) /
        getTotalBufferArea(sec) < 0.005);
    })

    it('two-sided line buffer matches winding-fill within tolerance', async function () {
      var line = {type: 'LineString',
        coordinates: [[0, 0], [1000, 0], [1000, 1000], [2000, 1500], [1500, 2500]]};
      var def = getTotalBufferArea(await bufferGeoms('-i l.json -buffer 200', {'l.json': line}));
      var sec = getTotalBufferArea(await bufferGeoms('-i l.json -buffer 200 sector-band', {'l.json': line}));
      assert(sec > 0);
      assert(Math.abs(def - sec) / sec < 0.005);
    })

    it('one-sided line buffer matches winding-fill within tolerance', async function () {
      var line = {type: 'LineString',
        coordinates: [[0, 0], [1000, 0], [1000, 1000], [2000, 1500], [1500, 2500]]};
      var def = getTotalBufferArea(await bufferGeoms('-i l.json -buffer 200 left', {'l.json': line}));
      var sec = getTotalBufferArea(await bufferGeoms('-i l.json -buffer 200 left sector-band', {'l.json': line}));
      assert(sec > 0);
      assert(Math.abs(def - sec) / sec < 0.005);
    })
  })

  // The debug-offset/debug-winding/debug-mosaic visualizations are only
  // implemented for line buffers; for polygon buffers they must be ignored
  // (a no-op that produces the ordinary buffer) rather than leaking into the
  // per-shape dissolve and corrupting the output. Buffer output is
  // deterministic, so the no-op contract is the exact ordinary-buffer output.
  describe('debug flags are a no-op for polygon buffers', function () {
    async function bufferJSON(cmd) {
      // format=geojson output is returned as a Buffer; normalize to a string
      // so identical content compares equal.
      return String((await api.applyCommands(cmd + ' -o format=geojson buffer.json'))['buffer.json']);
    }

    ['debug-offset', 'debug-winding', 'debug-mosaic'].forEach(function(flag) {
      it(flag + ' produces the ordinary polygon buffer', async function () {
        var file = 'test/data/features/buffer/o_polygon_with_hole_and_island.json';
        var def = await bufferJSON('-i ' + file + ' -buffer 500');
        var dbg = await bufferJSON('-i ' + file + ' -buffer 500 ' + flag);
        assert.strictEqual(dbg, def);
      })

      it(flag + ' produces the ordinary topological polygon buffer', async function () {
        var file = 'test/data/shapefile/six_counties.shp';
        var def = await bufferJSON('-i ' + file + ' -buffer 100m topological');
        var dbg = await bufferJSON('-i ' + file + ' -buffer 100m topological ' + flag);
        assert.strictEqual(dbg, def);
      })
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

})

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

