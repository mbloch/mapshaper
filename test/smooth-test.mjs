import api from '../mapshaper.js';
import assert from 'assert';
import { smoothArcCoords } from '../src/smooth/mapshaper-smooth-algos.mjs';
import { getCornerParams, findInteriorCorners, isStructuralRun } from '../src/smooth/mapshaper-smooth-corners.mjs';

// Build (t, channels) in planar x,y from a coordinate list, for testing the
// corner-detection helpers directly.
function planarChannels(coords) {
  var n = coords.length;
  var xx = new Float64Array(n), yy = new Float64Array(n), t = new Float64Array(n);
  for (var i = 0; i < n; i++) {
    xx[i] = coords[i][0];
    yy[i] = coords[i][1];
    if (i > 0) {
      t[i] = t[i - 1] + Math.sqrt(Math.pow(xx[i] - xx[i - 1], 2) + Math.pow(yy[i] - yy[i - 1], 2));
    }
  }
  return {t: t, channels: [xx, yy], n: n};
}

// Max distance from each point of @pts to the nearest vertex of polyline @ref.
function maxDeviation(ref, pts) {
  var max = 0;
  pts.forEach(function(p) {
    var best = Infinity;
    for (var i = 0; i < ref.length; i++) {
      var dx = p[0] - ref[i][0], dy = p[1] - ref[i][1];
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < best) best = d;
    }
    if (best > max) max = best;
  });
  return max;
}

function sampleLine(fn, n, x0, x1) {
  var coords = [];
  for (var i = 0; i < n; i++) {
    var x = x0 + (x1 - x0) * i / (n - 1);
    coords.push([x, fn(x)]);
  }
  return coords;
}

function lineFeature(coords) {
  return {
    type: 'FeatureCollection',
    features: [{type: 'Feature', properties: {id: 1}, geometry: {type: 'LineString', coordinates: coords}}]
  };
}

function getCoords(geojson) {
  var f = geojson.features ? geojson.features[0].geometry : geojson.geometries[0];
  return f.coordinates;
}

async function smoothLine(coords, cmdOpts) {
  var out = await api.applyCommands(
    '-i in.json -smooth ' + cmdOpts + ' -o out.json',
    {'in.json': JSON.stringify(lineFeature(coords))});
  return getCoords(JSON.parse(out['out.json']));
}

describe('mapshaper-smooth.js', function () {

  describe('smoothArcCoords() unit behavior', function () {
    it('leaves a straight line straight', function () {
      var xx = [], yy = [];
      for (var i = 0; i <= 20; i++) { xx.push(i); yy.push(2 * i + 3); }
      var res = smoothArcCoords(xx, yy, {tolerance: 5, method: 'paek', closed: false});
      // every output point should lie on the line y = 2x + 3
      var dev = 0;
      for (var j = 0; j < res.xx.length; j++) {
        dev = Math.max(dev, Math.abs(res.yy[j] - (2 * res.xx[j] + 3)));
      }
      assert(dev < 1e-6, 'deviation from line: ' + dev);
    });

    it('pins the endpoints of an open arc', function () {
      var xx = [], yy = [];
      for (var i = 0; i <= 40; i++) { xx.push(i); yy.push(Math.sin(i)); }
      var res = smoothArcCoords(xx, yy, {tolerance: 6, method: 'paek', closed: false});
      assert.equal(res.xx[0], 0);
      assert.equal(res.yy[0], Math.sin(0));
      assert.equal(res.xx[res.xx.length - 1], 40);
      assert.equal(res.yy[res.yy.length - 1], Math.sin(40));
    });

    it('returns a closed ring closed (no pinned corner)', function () {
      // square outline, edges subdivided, explicitly closed
      var pts = [];
      var corners = [[0,0],[10,0],[10,10],[0,10],[0,0]];
      for (var c = 0; c < corners.length - 1; c++) {
        var a = corners[c], b = corners[c+1];
        for (var k = 0; k < 10; k++) {
          pts.push([a[0] + (b[0]-a[0])*k/10, a[1] + (b[1]-a[1])*k/10]);
        }
      }
      pts.push([0,0]);
      var xx = pts.map(function(p){return p[0];});
      var yy = pts.map(function(p){return p[1];});
      var res = smoothArcCoords(xx, yy, {tolerance: 4, method: 'paek', closed: true});
      var n = res.xx.length;
      assert(n >= 16, 'closed ring should resolve with enough vertices');
      assert.equal(res.xx[0], res.xx[n - 1]);
      assert.equal(res.yy[0], res.yy[n - 1]);
      // corners should be rounded -> ring no longer reaches (10,10) corner exactly
      var reaches = res.xx.some(function(x, i){ return x > 9.9 && res.yy[i] > 9.9; });
      assert(!reaches, 'expected corners to be rounded inward');
    });

    it('passes short arcs (<3 vertices) through unchanged', function () {
      var res = smoothArcCoords([0, 5], [0, 5], {tolerance: 3, method: 'paek', closed: false});
      assert.deepEqual(res.xx, [0, 5]);
      assert.deepEqual(res.yy, [0, 5]);
    });
  });

  describe('scale-aware behavior', function () {
    var big = function(x) { return 10 * Math.sin(2 * Math.PI * x / 100); };
    var noisy = function(x) { return big(x) + Math.sin(2 * Math.PI * x / 4); };

    it('removes sub-tolerance detail (both methods)', async function () {
      var orig = sampleLine(noisy, 401, 0, 200);
      var ideal = sampleLine(big, 401, 0, 200);
      var noiseBefore = maxDeviation(ideal, orig); // ~1 (noise amplitude)
      for (var method of ['paek', 'gaussian']) {
        var sm = await smoothLine(orig, method + ' distance=16 planar');
        var noiseAfter = maxDeviation(ideal, sm);
        assert(noiseAfter < noiseBefore * 0.6,
          method + ': expected noise reduction, before=' + noiseBefore.toFixed(3) + ' after=' + noiseAfter.toFixed(3));
      }
    });

    it('keeps large features within the tolerance', async function () {
      var orig = sampleLine(noisy, 401, 0, 200);
      var sm = await smoothLine(orig, 'distance=16 planar');
      var dev = maxDeviation(orig, sm);
      assert(dev < 16, 'deviation from original (' + dev.toFixed(3) + ') should stay under tolerance');
    });

    it('a smaller tolerance preserves more detail than a larger one', async function () {
      var orig = sampleLine(noisy, 401, 0, 200);
      var ideal = sampleLine(big, 401, 0, 200);
      var small = maxDeviation(ideal, await smoothLine(orig, 'distance=4 planar'));
      var large = maxDeviation(ideal, await smoothLine(orig, 'distance=16 planar'));
      assert(small > large, 'smaller tolerance should leave more residual detail');
    });

    // Regression: input segments much longer than the kernel window used to
    // leave resampled query points with no nearby source vertices, snapping
    // them onto a single vertex (staircase clusters + apparent non-smoothing).
    it('tracks the line on sparse input (segments >> tolerance)', async function () {
      function distToSeg(p, a, b) {
        var vx = b[0] - a[0], vy = b[1] - a[1];
        var l2 = vx * vx + vy * vy;
        var t = l2 ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        var dx = p[0] - (a[0] + t * vx), dy = p[1] - (a[1] + t * vy);
        return Math.sqrt(dx * dx + dy * dy);
      }
      function maxDevToLine(ref, pts) {
        var max = 0;
        pts.forEach(function(p) {
          var best = Infinity;
          for (var i = 1; i < ref.length; i++) best = Math.min(best, distToSeg(p, ref[i - 1], ref[i]));
          if (best > max) max = best;
        });
        return max;
      }
      // gentle curve, vertices every 100 units; tolerance window (1.2*tol=12) is
      // far smaller than the 100-unit segment spacing
      var orig = sampleLine(function(x){ return 10 * Math.sin(2 * Math.PI * x / 1000); }, 21, 0, 2000);
      var sm = await smoothLine(orig, 'distance=10 planar');
      // no clustered/near-duplicate consecutive output points (the staircase signature)
      var dups = 0;
      for (var i = 1; i < sm.length; i++) {
        var dx = sm[i][0] - sm[i - 1][0], dy = sm[i][1] - sm[i - 1][1];
        if (Math.sqrt(dx * dx + dy * dy) < 0.1) dups++;
      }
      assert.equal(dups, 0, 'expected no near-duplicate consecutive points, got ' + dups);
      // and the smoothed line tracks the original (no snapping onto far vertices,
      // which would push the deviation toward the curve's amplitude of 10); the
      // resampler holds it within ~the deviation guard (0.1 * tolerance)
      var dev = maxDevToLine(orig, sm);
      assert(dev < 2, 'smoothed line strays from input (max dev ' + dev.toFixed(3) + ')');
    });
  });

  describe('command options', function () {
    it('defaults to the gaussian method', async function () {
      var orig = sampleLine(function(x){ return Math.sin(x); }, 100, 0, 50);
      var def = await smoothLine(orig, 'distance=5 planar');
      var gaussian = await smoothLine(orig, 'gaussian distance=5 planar');
      assert.deepEqual(def, gaussian);
    });

    it('still supports the undocumented paek method, distinct from gaussian', async function () {
      var orig = sampleLine(function(x){ return Math.sin(x); }, 100, 0, 50);
      var paek = await smoothLine(orig, 'paek distance=5 planar');
      var gaussian = await smoothLine(orig, 'gaussian distance=5 planar');
      assert.notDeepEqual(paek, gaussian);
    });

    it('gaussian preserves supra-tolerance amplitude (Savitzky-Golay, no shrinkage)', async function () {
      // a sine whose wavelength is 2x the tolerance should pass through with most
      // of its amplitude intact. A plain Gaussian-weighted average (degree-0)
      // pulls the peaks toward the local mean (here to ~0.84); the Savitzky-Golay
      // quadratic fit corrects that, matching paek to within a couple percent.
      function peakAmp(pts) {
        var m = 0;
        pts.forEach(function(p){ m = Math.max(m, Math.abs(p[1])); });
        return m;
      }
      var orig = sampleLine(function(x){ return Math.sin(2 * Math.PI * x / 10); }, 240, 0, 30);
      var gaussian = peakAmp(await smoothLine(orig, 'gaussian distance=5 planar'));
      var paek = peakAmp(await smoothLine(orig, 'paek distance=5 planar'));
      // compared on the same line (so resampling/boundary effects cancel): the
      // old degree-0 gaussian sat ~0.1 below paek here; the SG fit tracks it.
      assert(gaussian >= paek - 0.03,
        'gaussian (' + gaussian.toFixed(3) + ') should track paek (' + paek.toFixed(3) + '), not shrink below it');
    });

    it('gain=0 disables the shrinkage correction (more amplitude loss)', async function () {
      function peakAmp(pts) {
        var m = 0;
        pts.forEach(function(p){ m = Math.max(m, Math.abs(p[1])); });
        return m;
      }
      var orig = sampleLine(function(x){ return Math.sin(2 * Math.PI * x / 10); }, 240, 0, 30);
      var corrected = peakAmp(await smoothLine(orig, 'gaussian distance=5 planar'));
      var plain = peakAmp(await smoothLine(orig, 'gaussian distance=5 planar gain=0'));
      assert(plain < corrected - 0.1,
        'gain=0 (' + plain.toFixed(3) + ') should shrink more than corrected (' + corrected.toFixed(3) + ')');
    });

    it('gain controls the curvature correction continuously (both methods)', async function () {
      function peakAmp(pts) {
        var m = 0;
        pts.forEach(function(p){ m = Math.max(m, Math.abs(p[1])); });
        return m;
      }
      var orig = sampleLine(function(x){ return Math.sin(2 * Math.PI * x / 10); }, 240, 0, 30);
      for (var method of ['paek', 'gaussian']) {
        var stub = method + ' distance=5 planar';
        var g0 = peakAmp(await smoothLine(orig, stub + ' gain=0'));
        var g1 = peakAmp(await smoothLine(orig, stub + ' gain=1'));
        var g2 = peakAmp(await smoothLine(orig, stub + ' gain=2'));
        var g3 = peakAmp(await smoothLine(orig, stub + ' gain=3'));
        // gain=1 matches the default (corrected) output
        var dflt = peakAmp(await smoothLine(orig, stub));
        assert(Math.abs(g1 - dflt) < 1e-9,
          method + ' gain=1 (' + g1.toFixed(4) + ') should equal default (' + dflt.toFixed(4) + ')');
        // amplitude grows monotonically with gain; >2 keeps exaggerating
        assert(g0 < g1 && g1 < g2 && g2 < g3,
          method + ' amplitude should increase with gain: ' +
          [g0, g1, g2, g3].map(function(v){ return v.toFixed(3); }).join(' < '));
      }
    });

    it('max-bend-angle trades vertex count for join smoothness', async function () {
      // a sine wave with plenty of curvature for the output thinner to work on
      var orig = sampleLine(function(x){ return 4 * Math.sin(2 * Math.PI * x / 20); }, 400, 0, 80);
      var n4 = (await smoothLine(orig, 'distance=5 planar max-bend-angle=4')).length;
      var n8 = (await smoothLine(orig, 'distance=5 planar max-bend-angle=8')).length;
      var n16 = (await smoothLine(orig, 'distance=5 planar max-bend-angle=16')).length;
      var dflt = (await smoothLine(orig, 'distance=5 planar')).length;
      // a larger angle keeps fewer vertices
      assert(n4 > n8 && n8 > n16,
        'vertex count should drop as the angle grows: ' + [n4, n8, n16].join(' > '));
      // the default is 8 degrees
      assert.equal(n8, dflt, 'max-bend-angle=8 should match the default (' + n8 + ' vs ' + dflt + ')');
    });

    it('rejects a non-positive max-bend-angle', async function () {
      var orig = sampleLine(function(x){ return Math.sin(x); }, 50, 0, 10);
      await assert.rejects(async function () {
        await smoothLine(orig, 'distance=5 planar max-bend-angle=0');
      });
    });

    it('prefilters intricate detail by default; no-prefilter keeps it', async function () {
      // a long thin spike (a "jetty") on an otherwise straight line: too convoluted
      // for the low-pass smoother to generalize, so the default detail prefilter
      // should cut it; no-prefilter should leave it for the smoother to round off.
      var c = [];
      for (var x = 0; x <= 49; x++) c.push([x, 0]);
      c.push([50, 30]);                 // narrow spike tip, far above the baseline
      for (var x2 = 51; x2 <= 100; x2++) c.push([x2, 0]);
      function peakAmp(pts) {
        var m = 0;
        pts.forEach(function(p){ m = Math.max(m, Math.abs(p[1])); });
        return m;
      }
      var withPrefilter = peakAmp(await smoothLine(c, '8 planar'));
      var withoutPrefilter = peakAmp(await smoothLine(c, '8 planar no-prefilter'));
      assert(withPrefilter < 2,
        'default prefilter should cut the spike (amp ' + withPrefilter.toFixed(2) + ')');
      assert(withoutPrefilter > withPrefilter + 2,
        'no-prefilter should retain more of the spike (amp ' + withoutPrefilter.toFixed(2) + ')');
    });

    it('distance is a resolution: a feature ~D across is ~halved, finer removed, coarser kept', async function () {
      // sine of wavelength W, amplitude W/4; measure how much amplitude survives
      // when the smoothing distance is set relative to the feature wavelength.
      var W = 40, A = W / 4;
      var sine = sampleLine(function(x){ return A * Math.sin(2 * Math.PI * x / W); }, 401, 0, 10 * W);
      function keptFrac(pts) {
        var m = 0;
        pts.forEach(function(p){ m = Math.max(m, Math.abs(p[1])); });
        return m / A;
      }
      for (var method of ['paek', 'gaussian']) {
        var stub = ' planar no-prefilter ' + method;
        var fine = keptFrac(await smoothLine(sine, (W / 2) + stub));   // feature = 2*D
        var atRes = keptFrac(await smoothLine(sine, W + stub));        // feature = D
        var coarse = keptFrac(await smoothLine(sine, (2 * W) + stub)); // feature = 0.5*D
        // feature much larger than the distance: mostly preserved
        assert(fine > 0.75, method + ' feature=2*D should be largely kept (' + fine.toFixed(2) + ')');
        // feature about the size of the distance: roughly halved (-6 dB cutoff)
        assert(atRes > 0.3 && atRes < 0.6, method + ' feature=D should be ~halved (' + atRes.toFixed(2) + ')');
        // feature finer than the distance: removed
        assert(coarse < 0.2, method + ' feature=0.5*D should be removed (' + coarse.toFixed(2) + ')');
      }
    });

    it('errors when the distance parameter is missing', async function () {
      var orig = sampleLine(function(x){ return Math.sin(x); }, 20, 0, 10);
      await assert.rejects(smoothLine(orig, 'planar'));
    });

    it('errors on an unsupported method', async function () {
      var orig = sampleLine(function(x){ return Math.sin(x); }, 20, 0, 10);
      await assert.rejects(smoothLine(orig, 'distance=2 method=bogus planar'));
    });
  });

  describe('spherical (lng/lat) smoothing', function () {
    var D2R = Math.PI / 180;
    function lngLatToUnit(lng, lat) {
      var cl = Math.cos(lat * D2R);
      return [Math.cos(lng * D2R) * cl, Math.sin(lng * D2R) * cl, Math.sin(lat * D2R)];
    }
    function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
    function cross(a, b) {
      return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
    }
    function normalize(v) {
      var m = Math.sqrt(dot(v, v));
      return [v[0]/m, v[1]/m, v[2]/m];
    }
    // sample points along the great circle (geodesic) between two lng/lat points
    function greatCircleSamples(p0, p1, n) {
      var a = lngLatToUnit(p0[0], p0[1]), b = lngLatToUnit(p1[0], p1[1]);
      var omega = Math.acos(dot(a, b)), s = Math.sin(omega);
      var coords = [];
      for (var i = 0; i < n; i++) {
        var f = i / (n - 1);
        var k0 = Math.sin((1 - f) * omega) / s, k1 = Math.sin(f * omega) / s;
        var v = normalize([a[0]*k0 + b[0]*k1, a[1]*k0 + b[1]*k1, a[2]*k0 + b[2]*k1]);
        coords.push([Math.atan2(v[1], v[0]) / D2R, Math.asin(v[2]) / D2R]);
      }
      return coords;
    }

    // A great-circle arc is "straight" on the sphere. Because the 3D average of
    // coplanar vertices stays in their plane, smoothing in geocentric space
    // leaves a geodesic essentially unchanged -- whereas averaging raw lng/lat
    // would pull an oblique geodesic off the great circle.
    it('preserves a great-circle arc (geocentric averaging, no shear)', async function () {
      var gc = greatCircleSamples([0, 10], [80, 70], 120);
      var a = lngLatToUnit(0, 10), b = lngLatToUnit(80, 70);
      var normal = normalize(cross(a, b)); // great-circle plane normal
      for (var method of ['paek', 'gaussian']) {
        // default (spherical) mode -- note: no `planar` flag
        var sm = await smoothLine(gc, method + ' distance=300km');
        var maxOff = 0;
        sm.forEach(function(p) {
          maxOff = Math.max(maxOff, Math.abs(dot(lngLatToUnit(p[0], p[1]), normal)));
        });
        // distance from the great-circle plane (in unit-sphere terms) ~ angular
        // deviation; should be near machine precision, not a few km of shear.
        assert(maxOff < 1e-6, method + ': smoothed point left the great circle, off=' + maxOff);
      }
    });

    it('pins endpoints in spherical mode', async function () {
      var gc = greatCircleSamples([-30, 20], [40, 55], 80);
      var sm = await smoothLine(gc, 'distance=200km');
      assert.deepEqual(sm[0], gc[0]);
      assert.deepEqual(sm[sm.length - 1], gc[gc.length - 1]);
    });
  });

  describe('pending simplification', function () {
    // -simplify is non-destructive (it stores per-vertex thresholds). -smooth
    // rewrites coordinates, so any pending simplification must be locked in
    // first via arcs.flatten(); otherwise the full-resolution geometry would be
    // smoothed and the simplification silently lost.
    it('locks in pending simplification before smoothing', function () {
      var I = api.internal;
      var orig = sampleLine(function(x){ return Math.sin(x); }, 200, 0, 100);
      var ds = I.importGeoJSON(lineFeature(orig), {});
      I.buildTopology(ds);
      api.cmd.simplify(ds, {percentage: 0.3, planar: true}, ds.layers);
      assert(!ds.arcs.isFlat(), 'simplification should be pending (thresholds set)');
      var retainedBefore = ds.arcs.getRetainedInterval();
      assert(retainedBefore > 0, 'expected a non-zero retained interval');

      api.cmd.smooth(ds, {distance: 5, planar: true}, ds.layers);
      assert(ds.arcs.isFlat(), 'arcs should be flattened after smoothing');
      assert.equal(ds.arcs.getRetainedInterval(), 0);
    });
  });

  describe('topology preservation', function () {
    // Two polygons sharing a wiggly boundary. After building topology the shared
    // boundary is a single arc referenced by both shapes, so smoothing it once
    // keeps the boundary coincident -- re-importing and re-building topology must
    // recover the same shared-arc structure.
    function adjacentPolygons() {
      // shared boundary runs from (10,0) up to (10,10), with a gentle, well
      // resolved curve in x so smoothing actually moves it without bulging far
      // enough to introduce self-intersections (smoothing has no hard deviation
      // bound, so an adversarial wiggle could cross the outer edges).
      var shared = [];
      for (var i = 0; i <= 40; i++) {
        shared.push([10 + Math.sin(i / 2) * 0.3, i / 4]);
      }
      shared[0] = [10, 0];
      shared[shared.length - 1] = [10, 10];
      var leftRing = [[0, 0]].concat(shared).concat([[0, 10], [0, 0]]);
      var rightRing = [[20, 0], [20, 10], [10, 10]]
        .concat(shared.slice().reverse().slice(1)).concat([[20, 0]]);
      return {
        type: 'FeatureCollection',
        features: [
          {type: 'Feature', properties: {id: 'L'}, geometry: {type: 'Polygon', coordinates: [leftRing]}},
          {type: 'Feature', properties: {id: 'R'}, geometry: {type: 'Polygon', coordinates: [rightRing]}}
        ]
      };
    }

    it('keeps shared boundaries coincident through a round trip', async function () {
      var I = api.internal;
      var input = adjacentPolygons();
      var ds0 = I.importGeoJSON(input, {});
      I.buildTopology(ds0);
      var arcCount0 = ds0.arcs.size();

      var out = await api.applyCommands(
        '-i in.json -smooth distance=1 planar -o out.json',
        {'in.json': JSON.stringify(input)});
      var smoothed = JSON.parse(out['out.json']);

      var ds1 = I.importGeoJSON(smoothed, {});
      I.buildTopology(ds1);
      // If the two boundaries had diverged, re-topology would create duplicate
      // arcs (one per polygon) instead of recovering the shared structure.
      assert.equal(ds1.arcs.size(), arcCount0,
        'arc structure should be preserved (shared boundary stays coincident)');
    });

    it('does not change the number of arcs when smoothing in place', function () {
      var I = api.internal;
      var ds = I.importGeoJSON(adjacentPolygons(), {});
      I.buildTopology(ds);
      var before = ds.arcs.size();
      api.cmd.smooth(ds, {distance: 1, planar: true}, ds.layers);
      assert.equal(ds.arcs.size(), before);
    });
  });

  describe('adaptive output sampling', function () {
    // straight run -> tight quarter-circle bend -> straight run
    function straightBendStraight() {
      var c = [];
      for (var x = 0; x <= 300; x += 3) c.push([x, 0]);
      for (var a = -Math.PI / 2; a <= 0; a += 0.05) c.push([300 + 20 * Math.cos(a), 20 + 20 * Math.sin(a)]);
      for (var y = 20; y <= 320; y += 3) c.push([320, y]);
      return c;
    }

    it('places vertices in the bend and collapses straight runs to long segments', async function () {
      var sm = await smoothLine(straightBendStraight(), '30 planar');
      // the long lower straight run (300 units) carries almost no interior
      // vertices, while the much shorter bend carries several
      var straight = sm.filter(function(p) { return p[0] < 290 && Math.abs(p[1]) < 2; });
      var bend = sm.filter(function(p) { return p[0] >= 295 && p[0] <= 321 && p[1] >= -1 && p[1] <= 21; });
      assert(straight.length <= 2,
        'straight run should collapse to a long segment, got ' + straight.length + ' vertices');
      assert(bend.length > straight.length,
        'bend (' + bend.length + ') should carry more vertices than the longer straight run (' + straight.length + ')');
    });

    it('emits far fewer vertices than a mostly-straight input', async function () {
      var orig = straightBendStraight();
      var sm = await smoothLine(orig, '30 planar');
      assert(sm.length < orig.length / 2, 'expected sparse output, got ' + sm.length + ' of ' + orig.length);
    });

    it('keeps output density driven by shape, not the tolerance', async function () {
      // a fixed-shape feature should get a similar vertex count at different
      // tolerances (relative/angle flatness), not ~N times more at smaller tol
      var orig = straightBendStraight();
      var coarse = (await smoothLine(orig, '40 planar')).length;
      var fine = (await smoothLine(orig, '10 planar')).length;
      // 4x finer tolerance must not give ~4x the vertices; a modest increase is
      // expected because a smaller tolerance smooths the bend less, so its
      // smoothed form is genuinely sharper and needs a few more vertices.
      assert(fine < coarse * 2,
        'density should be roughly tolerance-independent (fine=' + fine + ', coarse=' + coarse + ')');
    });

    it('keeps a straight run flat (no facet deviation)', async function () {
      var coords = [];
      for (var x = 0; x <= 200; x += 4) coords.push([x, 0]);
      var sm = await smoothLine(coords, '20 planar');
      var maxY = 0;
      sm.forEach(function(p) { maxY = Math.max(maxY, Math.abs(p[1])); });
      assert(maxY < 1e-6, 'straight run deviated by ' + maxY);
    });

    function maxJoinAngleDeg(pts) {
      var max = 0;
      for (var i = 1; i < pts.length - 1; i++) {
        var ax = pts[i][0] - pts[i - 1][0], ay = pts[i][1] - pts[i - 1][1];
        var bx = pts[i + 1][0] - pts[i][0], by = pts[i + 1][1] - pts[i][1];
        var na = Math.sqrt(ax * ax + ay * ay), nb = Math.sqrt(bx * bx + by * by);
        if (na > 0 && nb > 0) {
          var k = (ax * bx + ay * by) / (na * nb);
          max = Math.max(max, Math.acos(Math.max(-1, Math.min(1, k))) * 180 / Math.PI);
        }
      }
      return max;
    }

    it('does not join a long straight run to a curve at a sharp angle', async function () {
      // Long straight run feeding tangentially into a gentle large-radius bend.
      // The straight must not be emitted as one long chord that overshoots into
      // the curve and meets it at a visible angle (the bug this guards against):
      // every joint, including the straight-to-curve transition, stays gentle.
      var c = [];
      for (var x = 0; x <= 1000; x += 10) c.push([x, 0]);
      for (var a = 0; a <= Math.PI / 2 + 1e-9; a += 0.02) {
        c.push([1000 + 400 * Math.sin(a), 400 - 400 * Math.cos(a)]);
      }
      var sm = await smoothLine(c, '60 planar');
      assert(maxJoinAngleDeg(sm) < 15,
        'max join angle too large: ' + maxJoinAngleDeg(sm).toFixed(1));
    });

    it('reaches an endpoint that lies in a curve without a long kinked segment', async function () {
      // Open line: straight run then an arc that is still bending at the final
      // vertex. A one-sided end window would drag the smoothed endpoint inward,
      // and pinning it back would leave a long, sharply-joined last segment
      // (the gaussian north-end artifact). Odd-reflection padding must avoid that
      // for both methods, while keeping the endpoint exact.
      var c = [];
      for (var x = 0; x <= 500; x += 10) c.push([x, 0]);
      for (var a = 0; a <= 1.0 + 1e-9; a += 0.03) c.push([500 + 200 * Math.sin(a), 200 - 200 * Math.cos(a)]);
      var end = c[c.length - 1];
      for (var mi = 0; mi < 2; mi++) {
        var method = mi === 0 ? 'gaussian' : 'paek';
        var sm = await smoothLine(c, '60 planar ' + method);
        var n = sm.length;
        assert.deepEqual(sm[n - 1], end, method + ': endpoint not preserved exactly');
        // join angle at the second-to-last vertex stays gentle
        var ax = sm[n - 2][0] - sm[n - 3][0], ay = sm[n - 2][1] - sm[n - 3][1];
        var bx = sm[n - 1][0] - sm[n - 2][0], by = sm[n - 1][1] - sm[n - 2][1];
        var na = Math.sqrt(ax * ax + ay * ay), nb = Math.sqrt(bx * bx + by * by);
        var join = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (na * nb)))) * 180 / Math.PI;
        assert(join < 12, method + ': sharp join at end (' + join.toFixed(1) + ' deg)');
        // last segment is not a long overshoot (compare to a typical bend segment)
        assert(nb < 3 * na, method + ': last segment is a long overshoot');
      }
    });

    it('keeps joins bounded through a variable-curvature line (long segments included)', async function () {
      // Mix of long gentle stretches and tighter bends. The tangent gate must
      // estimate the curve tangent near each endpoint (a fixed small offset), not
      // at a length-proportional point: on long segments a quarter-point estimate
      // under-detects divergence and lets an over-long chord through that joins
      // its neighbor at a visibly larger angle than elsewhere on the line.
      var c = [];
      for (var x = 0; x <= 6000; x += 10) c.push([x, 300 * Math.sin(x / 700) + 120 * Math.sin(x / 180)]);
      for (var mi = 0; mi < 2; mi++) {
        var method = mi === 0 ? '' : 'gaussian';
        var sm = await smoothLine(c, '120 planar ' + method);
        var mj = maxJoinAngleDeg(sm);
        assert(mj < 13, (method || 'paek') + ': join angle too large (' + mj.toFixed(1) + ' deg)');
      }
    });

    it('resolves a closed ring with enough vertices', async function () {
      var ring = [];
      for (var i = 0; i <= 64; i++) {
        var a = 2 * Math.PI * i / 64;
        ring.push([100 * Math.cos(a), 100 * Math.sin(a)]);
      }
      ring[ring.length - 1] = ring[0];
      var out = await api.applyCommands('-i in.json -smooth 20 planar -o out.json',
        {'in.json': JSON.stringify({type: 'FeatureCollection', features: [{type: 'Feature',
          properties: {id: 1}, geometry: {type: 'Polygon', coordinates: [ring]}}]})});
      var sm = getCoords(JSON.parse(out['out.json']))[0];
      assert(sm.length >= 16, 'ring under-resolved: ' + sm.length + ' vertices');
      assert.deepEqual(sm[0], sm[sm.length - 1], 'ring should be closed');
    });
  });

  describe('corner detection (unit)', function () {
    it('finds the single corner of an open L-shape', function () {
      var coords = [];
      for (var x = 0; x <= 100; x += 5) coords.push([x, 0]);
      for (var y = 5; y <= 100; y += 5) coords.push([100, y]);
      var d = planarChannels(coords);
      var corners = findInteriorCorners(d.t, d.channels, d.n, false, getCornerParams(20));
      assert.equal(corners.length, 1);
      assert.deepEqual(coords[corners[0]], [100, 0]);
    });

    it('finds four corners of a closed square ring', function () {
      var coords = [];
      for (var x = 0; x <= 100; x += 5) coords.push([x, 0]);
      for (var y = 5; y <= 100; y += 5) coords.push([100, y]);
      for (var x2 = 95; x2 >= 0; x2 -= 5) coords.push([x2, 100]);
      for (var y2 = 95; y2 >= 0; y2 -= 5) coords.push([0, y2]);
      coords.push([0, 0]); // close
      var d = planarChannels(coords);
      var corners = findInteriorCorners(d.t, d.channels, d.n, true, getCornerParams(20));
      assert.equal(corners.length, 4);
    });

    it('classifies a long straight run as structural but a wiggle as not', function () {
      var straight = planarChannels([[0, 0], [25, 0], [50, 0], [75, 0], [100, 0]]);
      assert(isStructuralRun(straight.t, straight.channels, 0, straight.n - 1, getCornerParams(20)));
      var wig = [];
      for (var x = 0; x <= 100; x += 2) wig.push([x, 5 * Math.sin(x / 2)]);
      var w = planarChannels(wig);
      assert(!isStructuralRun(w.t, w.channels, 0, w.n - 1, getCornerParams(20)));
    });

    it('treats a gentle large-radius arc as structural', function () {
      var arc = [];
      for (var a = -0.6; a <= 0.6 + 1e-9; a += 0.02) arc.push([200 * Math.sin(a), 200 * Math.cos(a)]);
      var d = planarChannels(arc);
      assert.equal(findInteriorCorners(d.t, d.channels, d.n, false, getCornerParams(15)).length, 0);
      assert(isStructuralRun(d.t, d.channels, 0, d.n - 1, getCornerParams(15)));
    });

    it('does not flag a uniformly (tightly) curving arc as corners', function () {
      // radius ~ tolerance, so the windowed direction change easily exceeds the
      // corner angle; but the turning is spread evenly, so the concentration
      // gate must keep it corner-free (it is a curve, not a kink).
      var arc = [];
      for (var a = -1.4; a <= 1.4 + 1e-9; a += 0.03) arc.push([12 * Math.sin(a), 12 * Math.cos(a)]);
      var d = planarChannels(arc);
      assert.equal(findInteriorCorners(d.t, d.channels, d.n, false, getCornerParams(20)).length, 0);
    });

    it('still finds a sharp corner embedded in a tightly curving line', function () {
      // same tight arc, but with one abrupt kink spliced in -- the concentration
      // gate must not suppress a genuine localized turn.
      var arc = [];
      for (var a = -1.0; a <= 0 + 1e-9; a += 0.03) arc.push([12 * Math.sin(a), 12 * Math.cos(a)]);
      var kx = arc[arc.length - 1][0], ky = arc[arc.length - 1][1];
      for (var b = 0; b <= 1.0 + 1e-9; b += 0.03) arc.push([kx - 12 * Math.sin(b), ky + 12 * (1 - Math.cos(b))]);
      var d = planarChannels(arc);
      var corners = findInteriorCorners(d.t, d.channels, d.n, false, getCornerParams(20));
      assert.equal(corners.length, 1);
    });
  });

  describe('keep-corners', function () {
    function minDistTo(pt, pts) {
      var best = Infinity;
      pts.forEach(function(p) {
        best = Math.min(best, Math.sqrt(Math.pow(p[0] - pt[0], 2) + Math.pow(p[1] - pt[1], 2)));
      });
      return best;
    }
    async function smoothPolygon(ring, cmdOpts) {
      var gj = {type: 'FeatureCollection', features: [{type: 'Feature', properties: {id: 1},
        geometry: {type: 'Polygon', coordinates: [ring]}}]};
      var out = await api.applyCommands('-i in.json -smooth ' + cmdOpts + ' -o out.json',
        {'in.json': JSON.stringify(gj)});
      return getCoords(JSON.parse(out['out.json']))[0];
    }
    // L-shaped polyline: long horizontal arm, sharp 90-degree corner, long vertical arm.
    function lShape() {
      var c = [];
      for (var x = 0; x <= 100; x += 5) c.push([x, 0]);
      for (var y = 5; y <= 100; y += 5) c.push([100, y]);
      return c;
    }

    it('preserves a sharp corner that plain smoothing rounds', async function () {
      var orig = lShape();
      var rounded = await smoothLine(orig, '20 planar');
      var kept = await smoothLine(orig, '20 planar keep-corners');
      assert(minDistTo([100, 0], rounded) > 1, 'plain smoothing should round the corner');
      assert(minDistTo([100, 0], kept) < 1e-9, 'keep-corners should preserve the corner exactly');
    });

    it('keeps straight runs straight up to the corner', async function () {
      var kept = await smoothLine(lShape(), '20 planar keep-corners');
      // horizontal arm (x strictly < corner) should stay on y = 0
      var armDev = 0;
      kept.forEach(function(p) { if (p[0] < 99.9) armDev = Math.max(armDev, Math.abs(p[1])); });
      assert(armDev < 1e-9, 'straight arm deviated by ' + armDev);
    });

    it('preserves all corners of a closed square ring', async function () {
      var ring = [];
      for (var x = 0; x <= 100; x += 5) ring.push([x, 0]);
      for (var y = 5; y <= 100; y += 5) ring.push([100, y]);
      for (var x2 = 95; x2 >= 0; x2 -= 5) ring.push([x2, 100]);
      for (var y2 = 95; y2 >= 0; y2 -= 5) ring.push([0, y2]);
      ring.push([0, 0]);
      var kept = await smoothPolygon(ring, '20 planar keep-corners');
      [[0, 0], [100, 0], [100, 100], [0, 100]].forEach(function(corner) {
        assert(minDistTo(corner, kept) < 1e-9, 'corner ' + corner + ' not preserved');
      });
      // a ring should come back closed
      assert.deepEqual(kept[0], kept[kept.length - 1]);
    });

    it('still smooths a wiggle between two straight arms', async function () {
      var c = [];
      for (var x = 0; x <= 100; x += 5) c.push([x, 0]);          // straight arm
      // sub-tolerance wiggle: wavelength ~9.4 << tolerance 15, amplitude 4
      for (var x2 = 102; x2 <= 148; x2 += 2) c.push([x2, 4 * Math.sin((x2 - 100) / 1.5)]);
      for (var k = 0; k <= 20; k++) c.push([150 + k * 3, k * 3]); // straight arm
      // no-prefilter so this exercises the smoother + keep-corners in isolation
      // (the default detail prefilter would reshape the wiggle first)
      var kept = await smoothLine(c, '15 planar keep-corners no-prefilter');
      // corner at the start of the wiggle is preserved...
      assert(minDistTo([100, 0], kept) < 1e-9, 'corner at start of wiggle not preserved');
      // ...but the body of the sub-tolerance wiggle (amplitude 4) is strongly
      // attenuated. The first/last wiggle vertices sit right at the pinned
      // corners and keep-corners deliberately preserves geometry there, so we
      // check the interior (away from the corner shadow), which is the intent.
      var wig = kept.filter(function(p) { return p[0] > 110 && p[0] < 140; });
      var maxAmp = 0;
      wig.forEach(function(p) { maxAmp = Math.max(maxAmp, Math.abs(p[1])); });
      assert(maxAmp < 2.5, 'wiggle was not smoothed (max amplitude ' + maxAmp.toFixed(2) + ')');
    });

    it('does not invent corners on a gently curving line', async function () {
      // large-radius arc: low curvature everywhere, no sharp corners
      var arc = [];
      for (var a = -0.6; a <= 0.6 + 1e-9; a += 0.02) arc.push([200 * Math.sin(a), 200 * Math.cos(a)]);
      var kept = await smoothLine(arc, '15 planar keep-corners');
      // treated as one structural run -> preserved verbatim (no spurious kinks)
      assert.deepEqual(kept, arc);
    });

    it('preserves a corner where a parallel meets a meridian (spherical)', async function () {
      var c = [];
      for (var lng = 0; lng <= 20; lng += 1) c.push([lng, 10]);        // parallel (curved in 3D)
      for (var lat = 11; lat <= 30; lat += 1) c.push([20, lat]);       // meridian
      var kept = await smoothLine(c, '100km keep-corners');            // default spherical
      assert(minDistTo([20, 10], kept) < 1e-9, 'spherical corner not preserved');
      assert.deepEqual(kept[0], c[0]);
      assert.deepEqual(kept[kept.length - 1], c[c.length - 1]);
    });

    it('preserves topology with a shared straight corner', async function () {
      var I = api.internal;
      // two polygons sharing an L-shaped boundary with a sharp corner at (10,5)
      var sharedFwd = [[10, 0], [10, 5], [15, 5]];
      var left = [[0, 0], [10, 0], [10, 5], [15, 5], [15, 10], [0, 10], [0, 0]];
      var right = [[15, 5], [10, 5], [10, 0], [20, 0], [20, 10], [15, 10], [15, 5]];
      var input = {type: 'FeatureCollection', features: [
        {type: 'Feature', properties: {id: 'L'}, geometry: {type: 'Polygon', coordinates: [left]}},
        {type: 'Feature', properties: {id: 'R'}, geometry: {type: 'Polygon', coordinates: [right]}}
      ]};
      var ds0 = I.importGeoJSON(input, {});
      I.buildTopology(ds0);
      var arcCount0 = ds0.arcs.size();
      var out = await api.applyCommands('-i in.json -smooth distance=2 planar keep-corners -o out.json',
        {'in.json': JSON.stringify(input)});
      var ds1 = I.importGeoJSON(JSON.parse(out['out.json']), {});
      I.buildTopology(ds1);
      assert.equal(ds1.arcs.size(), arcCount0, 'shared boundary should stay coincident');
      assert(!isNaN(sharedFwd[0][0]));
    });
  });
});
