import api from '../mapshaper.js';
import assert from 'assert';
import fs from 'fs';
import { smoothArcCoords } from '../src/smooth/mapshaper-smooth-algos.mjs';
import { getCornerParams, findInteriorCorners, isStructuralRun, isStraightRun, cornerTurn, cornerBiasScale } from '../src/smooth/mapshaper-smooth-corners.mjs';

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
        var sm = await smoothLine(orig, method + ' distance=4 planar');
        var noiseAfter = maxDeviation(ideal, sm);
        assert(noiseAfter < noiseBefore * 0.6,
          method + ': expected noise reduction, before=' + noiseBefore.toFixed(3) + ' after=' + noiseAfter.toFixed(3));
      }
    });

    it('keeps large features within the tolerance', async function () {
      var orig = sampleLine(noisy, 401, 0, 200);
      var sm = await smoothLine(orig, 'distance=4 planar');
      var dev = maxDeviation(orig, sm);
      assert(dev < 4, 'deviation from original (' + dev.toFixed(3) + ') should stay under tolerance');
    });

    it('a smaller tolerance preserves more detail than a larger one', async function () {
      var orig = sampleLine(noisy, 401, 0, 200);
      var ideal = sampleLine(big, 401, 0, 200);
      var small = maxDeviation(ideal, await smoothLine(orig, 'distance=1 planar'));
      var large = maxDeviation(ideal, await smoothLine(orig, 'distance=4 planar'));
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
      // a sine near the kernel's cutoff wavelength (here ~1.5x the widened kernel)
      // should pass through with most of its amplitude intact. A plain
      // Gaussian-weighted average (degree-0) pulls the peaks toward the local mean;
      // the Savitzky-Golay quadratic fit corrects that, matching paek to within a
      // couple percent. no-corners isolates the kernel from corner pinning.
      function peakAmp(pts) {
        var m = 0;
        pts.forEach(function(p){ m = Math.max(m, Math.abs(p[1])); });
        return m;
      }
      var orig = sampleLine(function(x){ return Math.sin(2 * Math.PI * x / 40); }, 240, 0, 120);
      var gaussian = peakAmp(await smoothLine(orig, 'gaussian distance=5 planar no-corners'));
      var paek = peakAmp(await smoothLine(orig, 'paek distance=5 planar no-corners'));
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
      var orig = sampleLine(function(x){ return Math.sin(2 * Math.PI * x / 40); }, 240, 0, 120);
      var corrected = peakAmp(await smoothLine(orig, 'gaussian distance=5 planar no-corners'));
      var plain = peakAmp(await smoothLine(orig, 'gaussian distance=5 planar no-corners gain=0'));
      assert(plain < corrected - 0.1,
        'gain=0 (' + plain.toFixed(3) + ') should shrink more than corrected (' + corrected.toFixed(3) + ')');
    });

    it('gain controls the curvature correction continuously (both methods)', async function () {
      function peakAmp(pts) {
        var m = 0;
        pts.forEach(function(p){ m = Math.max(m, Math.abs(p[1])); });
        return m;
      }
      var orig = sampleLine(function(x){ return Math.sin(2 * Math.PI * x / 40); }, 240, 0, 120);
      for (var method of ['paek', 'gaussian']) {
        var stub = method + ' distance=5 planar no-corners';
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
      var n4 = (await smoothLine(orig, 'distance=5 planar no-corners max-bend-angle=4')).length;
      var n8 = (await smoothLine(orig, 'distance=5 planar no-corners max-bend-angle=8')).length;
      var n16 = (await smoothLine(orig, 'distance=5 planar no-corners max-bend-angle=16')).length;
      var dflt = (await smoothLine(orig, 'distance=5 planar no-corners')).length;
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

    it('distance sets a resolution: the -6 dB cutoff sits near ~5x the distance', async function () {
      // The kernel is widened by KERNEL_STRENGTH (=5) so the distance approximates
      // the max displacement at sharp features; the frequency cutoff therefore
      // sits near a wavelength of 5*distance. Sine of wavelength W, amplitude W/4;
      // measure how much amplitude survives at distances set relative to W.
      var W = 40, A = W / 4;
      var sine = sampleLine(function(x){ return A * Math.sin(2 * Math.PI * x / W); }, 401, 0, 10 * W);
      function keptFrac(pts) {
        var m = 0;
        pts.forEach(function(p){ m = Math.max(m, Math.abs(p[1])); });
        return m / A;
      }
      for (var method of ['paek', 'gaussian']) {
        var stub = ' planar no-prefilter no-corners ' + method;
        var fine = keptFrac(await smoothLine(sine, (W / 10) + stub));   // wavelength = 10*D
        var atRes = keptFrac(await smoothLine(sine, (W / 5) + stub));    // wavelength = 5*D
        var coarse = keptFrac(await smoothLine(sine, (2 * W / 5) + stub)); // wavelength = 2.5*D
        // wavelength well above the cutoff (10*D): mostly preserved
        assert(fine > 0.75, method + ' wavelength=10*D should be largely kept (' + fine.toFixed(2) + ')');
        // wavelength ~ the cutoff (5*D): roughly halved (-6 dB)
        assert(atRes > 0.3 && atRes < 0.6, method + ' wavelength=5*D should be ~halved (' + atRes.toFixed(2) + ')');
        // wavelength below the cutoff (2.5*D): removed
        assert(coarse < 0.2, method + ' wavelength=2.5*D should be removed (' + coarse.toFixed(2) + ')');
      }
    });

    // Regression: the detail prefilter used to destroy every closed ring whose
    // perimeter fit inside the survivor-merge window, because a ring's seam chord
    // (coincident first/last vertex) has length 0 and infinite tortuosity. The
    // roundness gate keeps substantial, rounded islands.
    it('retains rounded islands through the smooth prefilter (q_line)', async function () {
      var input = fs.readFileSync('test/data/features/smooth/q_line.json', 'utf8');
      function countClosedRings(geojson) {
        var parts = geojson.features[0].geometry.coordinates;
        return parts.filter(function(p) {
          var a = p[0], b = p[p.length - 1];
          return a[0] === b[0] && a[1] === b[1];
        }).length;
      }
      var before = countClosedRings(JSON.parse(input));
      var kept = await api.applyCommands('-i in.json -smooth 500m -o out.json', {'in.json': input});
      var after = countClosedRings(JSON.parse(kept['out.json']));
      // before the fix only 4 of 149 survived; the gate keeps far more
      assert(after >= 25, 'expected many islands retained, got ' + after + ' of ' + before);
      // prefilter-roundness=0 restores the legacy (aggressive) removal
      var off = await api.applyCommands('-i in.json -smooth 500m prefilter-roundness=0 -o out.json', {'in.json': input});
      var afterOff = countClosedRings(JSON.parse(off['out.json']));
      assert(afterOff < after, 'roundness=0 should remove more islands (' + afterOff + ' vs ' + after + ')');
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
      // no-corners isolates the adaptive sampler (corner preservation would copy
      // the straight runs verbatim instead of collapsing them)
      var sm = await smoothLine(straightBendStraight(), '30 planar no-corners');
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
      var sm = await smoothLine(orig, '30 planar no-corners');
      assert(sm.length < orig.length / 2, 'expected sparse output, got ' + sm.length + ' of ' + orig.length);
    });

    it('keeps output density driven by shape, not the tolerance', async function () {
      // a fixed-shape feature should get a similar vertex count at different
      // tolerances (relative/angle flatness), not ~N times more at smaller tol
      var orig = straightBendStraight();
      var coarse = (await smoothLine(orig, '40 planar no-corners')).length;
      var fine = (await smoothLine(orig, '10 planar no-corners')).length;
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

  describe('corner preservation', function () {
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

    it('preserves a sharp corner by default; no-corners rounds it', async function () {
      var orig = lShape();
      var rounded = await smoothLine(orig, '20 planar no-corners');
      var kept = await smoothLine(orig, '20 planar');
      assert(minDistTo([100, 0], rounded) > 1, 'no-corners should round the corner');
      assert(minDistTo([100, 0], kept) < 1e-9, 'corner should be preserved by default');
    });

    it('corner-bias=0 is neutral (keeps the corner, same as default)', async function () {
      var orig = lShape();
      var kept = await smoothLine(orig, '20 planar corner-bias=0');
      assert(minDistTo([100, 0], kept) < 1e-9, 'corner-bias=0 should preserve the corner');
    });

    it('keeps straight runs straight up to the corner', async function () {
      var kept = await smoothLine(lShape(), '20 planar');
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
      var kept = await smoothPolygon(ring, '20 planar');
      [[0, 0], [100, 0], [100, 100], [0, 100]].forEach(function(corner) {
        assert(minDistTo(corner, kept) < 1e-9, 'corner ' + corner + ' not preserved');
      });
      // a ring should come back closed
      assert.deepEqual(kept[0], kept[kept.length - 1]);
    });

    // Regression: on a natural ring with no straight segments, corner detection
    // used to flag a bend and pin it via the ring-to-open rotation, producing a
    // spurious cusp whose location jumped with the smoothing distance (the
    // tolerance-scaled detection window). Corners must only be pinned when they
    // border a genuine structural run, so a structure-free ring smooths exactly
    // like no-corners at every distance.
    it('does not pin spurious corners on a structure-free wiggly ring', function () {
      var ring = [];
      for (var i = 0; i < 72; i++) {
        var a = 2 * Math.PI * i / 72;
        var r = 100 + 6 * Math.sin(5 * a); // gently lumpy circle, no straight edges
        ring.push([r * Math.cos(a), r * Math.sin(a)]);
      }
      ring.push(ring[0].slice());
      var xx = ring.map(function(p) { return p[0]; });
      var yy = ring.map(function(p) { return p[1]; });
      [20, 30, 40, 50].forEach(function(tol) {
        var kept = smoothArcCoords(xx, yy, {tolerance: tol, method: 'gaussian', planar: true, closed: true, keepCorners: true});
        var off = smoothArcCoords(xx, yy, {tolerance: tol, method: 'gaussian', planar: true, closed: true, keepCorners: false});
        assert.deepEqual(kept.xx, off.xx, 'tol=' + tol + ' pinned a spurious corner (x)');
        assert.deepEqual(kept.yy, off.yy, 'tol=' + tol + ' pinned a spurious corner (y)');
      });
    });

    // Performance regression: a large closed ring smoothed below its vertex
    // spacing (so nearly every one of its N vertices reads as a corner) used to
    // hang. Three O(N^2) hot spots were involved: the corner cull restarted its
    // scan after every removal; the non-maximum-suppression test scanned every
    // vertex per candidate; and cornerTurn rebuilt the ring's segment-length
    // array on every call. All are now O(N), so a 30k-vertex ring smooths in a
    // few ms -- any of the quadratics returning would blow the time budget below
    // (each would take seconds at this size) or trip the mocha timeout.
    it('smooths a large jagged ring below its vertex spacing without hanging', function () {
      this.timeout(15000);
      var N = 30000, R = 1e6, xx = [], yy = [];
      for (var i = 0; i < N; i++) {
        var a = 2 * Math.PI * i / N;
        // alternate the radius so every vertex is a sharp, unstructured corner;
        // segment length is far larger than the smoothing distance (100)
        var r = R + (i % 2 ? 4e5 : -4e5);
        xx.push(r * Math.cos(a));
        yy.push(r * Math.sin(a));
      }
      xx.push(xx[0]); yy.push(yy[0]);
      var t0 = Date.now();
      var res = smoothArcCoords(xx, yy, {tolerance: 100, method: 'gaussian', planar: true, closed: true, keepCorners: true});
      assert(Date.now() - t0 < 3000, 'took ' + (Date.now() - t0) + 'ms (quadratic smoothing regression)');
      assert(res.xx.length > 0);
      assert.deepEqual([res.xx[0], res.yy[0]], [res.xx[res.xx.length - 1], res.yy[res.yy.length - 1]]);
    });

    it('retains genuine corners of a rounded-rectangle (long straight sides)', async function () {
      // straight edges (structural runs) meeting at sharp corners: corner
      // preservation MUST still fire here (contrast with the wiggly ring above).
      var ring = [];
      for (var x = 0; x <= 200; x += 5) ring.push([x, 0]);
      for (var y = 5; y <= 100; y += 5) ring.push([200, y]);
      for (var x2 = 195; x2 >= 0; x2 -= 5) ring.push([x2, 100]);
      for (var y2 = 95; y2 >= 0; y2 -= 5) ring.push([0, y2]);
      ring.push([0, 0]);
      var kept = await smoothPolygon(ring, '20 planar');
      [[0, 0], [200, 0], [200, 100], [0, 100]].forEach(function(corner) {
        assert(minDistTo(corner, kept) < 1e-9, 'structural corner ' + corner + ' not preserved');
      });
    });

    // The reported case: q_detail1 is a natural island. At every distance the
    // default output must match no-corners (no pinned cusp at the bottom/upper-right).
    it('smooths the q_detail1 island with no spurious corners at any distance', async function () {
      var input = fs.readFileSync('test/data/features/smooth/q_detail1.json', 'utf8');
      for (var d of [300, 400, 500, 600, 700]) {
        var def = await api.applyCommands('-i in.json -smooth ' + d + 'm -o out.json', {'in.json': input});
        var nc = await api.applyCommands('-i in.json -smooth ' + d + 'm no-corners -o out.json', {'in.json': input});
        assert.deepEqual(JSON.parse(def['out.json']), JSON.parse(nc['out.json']),
          'distance ' + d + 'm pinned a spurious corner');
      }
    });

    // Reported case: at 600m the prefilter shredded the q_detail3 island down to
    // a ~28%-area distorted remnant. It should instead be dropped cleanly (the
    // island is near-scale at that distance), while at 500m it is still retained.
    // The drop is the prefilter's min-area gate; disabling it restores the remnant.
    it('drops (not mangles) a near-scale island the prefilter shreds', async function () {
      var input = fs.readFileSync('test/data/features/smooth/q_detail3.json', 'utf8');
      function vertsAt(out) {
        var gj = JSON.parse(out['out.json']);
        var g = gj.features ? gj.features[0].geometry : gj.geometries[0];
        if (!g) return 0;
        var c = g.coordinates;
        var ring = g.type === 'Polygon' ? c[0] : (g.type === 'LineString' ? c : c[0][0]);
        return ring ? ring.length : 0;
      }
      var d500 = await api.applyCommands('-i in.json -smooth 500m -o out.json', {'in.json': input});
      assert(vertsAt(d500) > 20, '500m island should be retained');
      var d600 = await api.applyCommands('-i in.json -smooth 600m -o out.json', {'in.json': input});
      assert.equal(vertsAt(d600), 0, '600m island should be dropped, not left as a remnant');
      var off = await api.applyCommands('-i in.json -smooth 600m prefilter-min-area=0 -o out.json', {'in.json': input});
      // disabling the gate keeps the shredded remnant as a (rounded) ring rather
      // than dropping it; the exact vertex count depends on the ring-scale cap.
      assert(vertsAt(off) > 8, 'prefilter-min-area=0 should restore the remnant');
    });

    it('smooths a wiggle away while keeping the real direction change', async function () {
      var c = [];
      for (var x = 0; x <= 100; x += 5) c.push([x, 0]);          // horizontal arm
      // sub-tolerance wiggle: wavelength ~9.4 << tolerance 15, amplitude 4.
      // Its centerline stays horizontal, so it is detail on the horizontal run,
      // not a corner: the genuine direction change is where the 45-deg arm starts.
      for (var x2 = 102; x2 <= 148; x2 += 2) c.push([x2, 4 * Math.sin((x2 - 100) / 1.5)]);
      for (var k = 0; k <= 20; k++) c.push([150 + k * 3, k * 3]); // 45-deg arm
      // no-prefilter so this exercises the smoother + corner preservation in
      // isolation (the default detail prefilter would reshape the wiggle first)
      var kept = await smoothLine(c, '15 planar no-prefilter');
      // The body of the sub-tolerance wiggle (amplitude 4) is strongly attenuated.
      var wig = kept.filter(function(p) { return p[0] > 110 && p[0] < 140; });
      var maxAmp = 0;
      wig.forEach(function(p) { maxAmp = Math.max(maxAmp, Math.abs(p[1])); });
      assert(maxAmp < 2.5, 'wiggle was not smoothed (max amplitude ' + maxAmp.toFixed(2) + ')');
      // The horizontal arm proper (away from the wiggle) stays flat.
      var arm = kept.filter(function(p) { return p[0] <= 80; });
      var armAmp = 0;
      arm.forEach(function(p) { armAmp = Math.max(armAmp, Math.abs(p[1])); });
      assert(armAmp < 1e-6, 'horizontal arm was distorted (max |y| ' + armAmp.toFixed(3) + ')');
      // The real direction change is preserved as a clean bend: the 45-deg arm
      // stays straight. Corner retention requires a chord-straight bordering
      // span, and here the corner candidates all sit on wiggle peaks whose spans
      // are not chord-straight, so nothing is pinned to a point -- the junction
      // apex is rounded over ~tol rather than kept as a hard corner. That is the
      // intended behaviour: the arms are preserved, only the vertex is softened.
      var farArm = kept.filter(function(p) { return p[0] > 175; });
      var armResid = 0;
      farArm.forEach(function(p) { armResid = Math.max(armResid, Math.abs(p[1] - (p[0] - 150)) / Math.SQRT2); });
      assert(armResid < 0.5, 'the 45-deg arm was not kept straight (max residual ' + armResid.toFixed(2) + ')');
      // the junction is rounded, not pinned to the original vertex
      assert(minDistTo([150, 0], kept) > 1, 'junction should be rounded, not pinned as a hard corner');
    });

    // isStraightRun measures deviation from the endpoint chord, so it is robust
    // to sub-tolerance digitizing wiggle; isStructuralRun sums raw per-segment
    // turning and so rejects a finely ragged (but geometrically straight) run.
    // Corner retention keys off the former, verbatim-copy off the latter.
    it('distinguishes a chord-straight-but-noisy run from a curving one', function () {
      var params = getCornerParams(15 * 1.2, 0);
      // A geometrically straight border (along y=0) with fine sub-tolerance
      // zig-zag: large total per-vertex turning, tiny deviation from the chord.
      var noisy = [];
      for (var x = 0; x <= 120; x += 2) noisy.push([x, (x / 2) % 2 ? 0.4 : -0.4]);
      var a = planarChannels(noisy);
      assert(isStraightRun(a.t, a.channels, 0, a.n - 1, params),
        'noisy-but-straight run should read as straight');
      assert(!isStructuralRun(a.t, a.channels, 0, a.n - 1, params),
        'the per-vertex turning of the zig-zag should fail the structural test');
      // A gently curving arc of comparable length bows far from its chord.
      var arc = [];
      for (var i = 0; i <= 60; i++) {
        var ang = -0.6 + 1.2 * i / 60;
        arc.push([100 * Math.sin(ang), 100 * Math.cos(ang)]);
      }
      var b = planarChannels(arc);
      assert(!isStraightRun(b.t, b.channels, 0, b.n - 1, params),
        'a curving arc should not read as straight');
    });

    // Reported case (u_detail2): on sparse / already-simplified data a gently
    // curving coast is sampled as a few long segments, and a short near-collinear
    // stub only ~1*tol long (1-2 segments) used to pass the chord test and pin a
    // spurious corner, kinking the curve. Pinning now requires a run clearly
    // longer than the smoothing distance (minPinRunLen ~ 2*tol).
    it('does not pin a corner on a short near-collinear stub, but does on a long run', function () {
      var params = getCornerParams(15 * 1.2, 0); // tol 18: minRunLen 18, minPinRunLen 36
      // three nearly collinear points ~24 units long: over minRunLen, under
      // minPinRunLen, and geometrically straight (deviation 0.1/24 << 0.03)
      var stub = planarChannels([[0, 0], [12, 0.1], [24, 0]]);
      assert(!isStraightRun(stub.t, stub.channels, 0, stub.n - 1, params),
        'a ~1*tol stub should be too short to anchor a corner');
      // the same near-straight run extended past 2*tol qualifies
      var longRun = planarChannels([[0, 0], [12, 0.1], [24, 0], [36, 0.1], [48, 0]]);
      assert(isStraightRun(longRun.t, longRun.channels, 0, longRun.n - 1, params),
        'a run clearly longer than the smoothing distance should be pinnable');
      // corner-bias=1 (k=2) halves minPinRunLen back to 1*tol, re-admitting the stub
      var biased = getCornerParams(15 * 1.2, 1);
      assert(isStraightRun(stub.t, stub.channels, 0, stub.n - 1, biased),
        'corner-bias=1 should re-admit the short run');
    });

    // Reported case (u_detail1): on a borderline-straight run (a coastline
    // sampled as a few long segments, deviation just under the base limit) a
    // *gentle* bend used to be pinned, kinking the smooth curve. Retention now
    // tightens the straightness a run must have in proportion to the bend it
    // anchors (isStraightRun's devLimit param, fed by retentionDevLimit): a run
    // that itself curves near the base limit only pins a sharp corner.
    it('needs a straighter run to pin a gentle bend than a sharp one', function () {
      var params = getCornerParams(15 * 1.2, 0); // tol 18, minPinRunLen 36
      // shallow arc, length ~120 (> minPinRunLen), chord deviation ratio ~0.025:
      // straight at the base tolerance (0.03) but only borderline so.
      var arc = [], R = 600, half = 60, ang0 = Math.asin(half / R), N = 40;
      for (var i = 0; i <= N; i++) {
        var a = -ang0 + 2 * ang0 * i / N;
        arc.push([R * Math.sin(a) + half, R * Math.cos(a) - R * Math.cos(ang0)]);
      }
      var d = planarChannels(arc);
      // passes at the base straightness tolerance...
      assert(isStraightRun(d.t, d.channels, 0, d.n - 1, params),
        'a ~0.025-deviation run should be straight at the base tolerance');
      // ...but a gentle corner (retentionDevLimit(~45 deg) ~ 0.020) rejects it,
      // while a sharp corner (limit capped at 0.03) still accepts it.
      var gentleLimit = (45 * Math.PI / 180) / 40;   // ~0.0196
      var sharpLimit = (90 * Math.PI / 180) / 40;    // capped at 0.03 in practice
      assert(!isStraightRun(d.t, d.channels, 0, d.n - 1, params, gentleLimit),
        'a gentle bend must not be pinned to a borderline-straight run');
      assert(isStraightRun(d.t, d.channels, 0, d.n - 1, params, Math.min(0.03, sharpLimit)),
        'a sharp bend may still be pinned to the same run');
    });

    // corner-bias scales only the distance-proportional detection parameters
    // (by keying them off tol/k, k = cornerBiasScale(bias)), leaving angles/ratios
    // fixed. bias=-1 gives k=1/2, so `corner-bias=-1 1km` must detect exactly the
    // corners `2km` (neutral) would.
    it('corner-bias scales distance params only: bias=-1 at 1km == 2km', function () {
      var a = getCornerParams(1000 * 1.2, -1);
      var b = getCornerParams(2000 * 1.2, 0);
      ['cornerAngle', 'tangentWindow', 'innerWindow', 'concentration',
       'minRunLen', 'minPinRunLen', 'maxTurnRate'].forEach(function (k) {
        assert(Math.abs(a[k] - b[k]) < 1e-9, k + ' should match (' + a[k] + ' vs ' + b[k] + ')');
      });
      // the dimensionless thresholds are unchanged by bias
      var base = getCornerParams(1000 * 1.2, 0);
      assert.equal(a.cornerAngle, base.cornerAngle);
      assert.equal(a.concentration, base.concentration);
      // and detection itself agrees on a mixed straight/curved line
      var c = [];
      for (var x = 0; x <= 6000; x += 200) c.push([x, 0]);                 // straight
      for (var k = 1; k <= 30; k++) c.push([6000 + 200 * k, 200 * k]);     // 45-deg arm
      for (var j = 1; j <= 30; j++) c.push([6000 + 200 * (30 + j), 6000]); // flat again
      var d = planarChannels(c);
      assert.deepEqual(
        findInteriorCorners(d.t, d.channels, d.n, false, a),
        findInteriorCorners(d.t, d.channels, d.n, false, b),
        'corner-bias=-1 at 1km should detect the same corners as 2km');
    });

    it('cornerBiasScale is neutral at 0 and symmetric about it', function () {
      // 0 is neutral, undefined/null fall back to neutral
      assert.equal(cornerBiasScale(0), 1);
      assert.equal(cornerBiasScale(undefined), 1);
      assert.equal(cornerBiasScale(null), 1);
      // positive doubles/triples, negative halves/thirds
      assert.equal(cornerBiasScale(1), 2);
      assert.equal(cornerBiasScale(2), 3);
      assert(Math.abs(cornerBiasScale(-1) - 0.5) < 1e-12);
      assert(Math.abs(cornerBiasScale(-2) - 1 / 3) < 1e-12);
      // reciprocal symmetry: k(+b) * k(-b) == 1
      [0.5, 1, 2, 3.7].forEach(function (b) {
        assert(Math.abs(cornerBiasScale(b) * cornerBiasScale(-b) - 1) < 1e-12,
          'k(' + b + ') * k(' + -b + ') should be 1');
      });
    });

    it('cornerTurn measures the windowed bend at a vertex', function () {
      var params = getCornerParams(40); // tangentWindow 10
      function elbow(deg) {
        var c = [], rad = deg * Math.PI / 180;
        for (var x = 0; x <= 40; x += 2) c.push([x, 0]);            // straight in
        for (var k = 1; k <= 20; k++) c.push([40 + 2 * k * Math.cos(rad), 2 * k * Math.sin(rad)]);
        return planarChannels(c);
      }
      var g45 = elbow(45), g90 = elbow(90);
      var i45 = 20, i90 = 20; // junction vertex index (x=40)
      var deg = function (r) { return r * 180 / Math.PI; };
      assert(Math.abs(deg(cornerTurn(g45.t, g45.channels, g45.n, i45, false, params)) - 45) < 3,
        '45-deg elbow should read ~45 deg');
      assert(Math.abs(deg(cornerTurn(g90.t, g90.channels, g90.n, i90, false, params)) - 90) < 3,
        '90-deg elbow should read ~90 deg');
    });

    // Reported case (j_detail1): a long straight border that is finely ragged
    // used to have its bounding corners dropped (its high per-vertex turning
    // failed the old structural gate), so smoothing curved both ends into the
    // adjacent bendy stretches. It must now keep the corner at the straight
    // border's end and stay straight, without pinning the bendy junctions.
    it('keeps the corner of a finely ragged straight border and stays straight', async function () {
      var c = [];
      // bendy lead-in: quarter arc (radius 30, high curvature -> not a straight
      // run) from (30,30) down to (0,0), arriving with a vertical tangent so the
      // junction with the horizontal border is a genuine ~90-deg corner.
      for (var i = 24; i >= 0; i--) {
        var ang = Math.PI / 2 * i / 24;
        c.push([30 - 30 * Math.cos(ang), 30 * Math.sin(ang)]);
      }
      // long straight border along y=0 with fine sub-tolerance zig-zag noise
      for (var x = 2; x <= 200; x += 2) c.push([x, (x / 2) % 2 ? 0.4 : -0.4]);
      c[c.length - 1][1] = 0; // clean terminus (the pinned endpoint isn't at a noise extreme)
      var kept = await smoothLine(c, '15 planar no-prefilter');
      // the corner at the start of the straight border (~[0,0]) is pinned
      assert(minDistTo([0, 0], kept) < 1e-6, 'straight-border corner was not preserved');
      // the far half of the straight border stays flat (not curved), and the
      // fine noise is smoothed away rather than pinned
      var farHalf = kept.filter(function(p) { return p[0] > 120; });
      var amp = 0;
      farHalf.forEach(function(p) { amp = Math.max(amp, Math.abs(p[1])); });
      assert(amp < 0.3, 'straight border did not stay straight (max |y| ' + amp.toFixed(3) + ')');
    });

    it('does not invent corners on a gently curving line', async function () {
      // large-radius arc: low curvature everywhere, no sharp corners
      var arc = [];
      for (var a = -0.6; a <= 0.6 + 1e-9; a += 0.02) arc.push([200 * Math.sin(a), 200 * Math.cos(a)]);
      var kept = await smoothLine(arc, '15 planar');
      // treated as one structural run -> not smoothed, but resampled to a SUBSET
      // of the original vertices (adaptive spacing), so every output point lies
      // exactly on an original vertex, in order, and no kink is invented.
      var j = 0;
      kept.forEach(function(p) {
        while (j < arc.length && !(arc[j][0] === p[0] && arc[j][1] === p[1])) j++;
        assert(j < arc.length, 'output point ' + p + ' is not an original vertex (in order)');
        j++;
      });
      assert.deepEqual(kept[0], arc[0], 'first vertex preserved');
      assert.deepEqual(kept[kept.length - 1], arc[arc.length - 1], 'last vertex preserved');
      assert(kept.length >= 2 && kept.length <= arc.length);
    });

    it('resamples (thins) a straight structural run instead of copying it verbatim', async function () {
      // L-shape with densely digitized straight arms meeting at a sharp corner.
      // Each arm is a structural run: not smoothed, but decimated to a subset of
      // its original vertices (a straight run collapses toward its endpoints), so
      // the output is far smaller while corner/endpoints are exact.
      var pts = [];
      for (var x = 0; x <= 200; x += 1) pts.push([x, 0]);     // horizontal arm
      for (var y = 1; y <= 200; y += 1) pts.push([200, y]);   // vertical arm
      var kept = await smoothLine(pts, '15 planar no-prefilter');
      assert(kept.length < pts.length / 4, 'straight arms not thinned (' + kept.length + ' of ' + pts.length + ')');
      assert(minDistTo([200, 0], kept) < 1e-9, 'corner not preserved');
      assert.deepEqual(kept[0], [0, 0], 'start endpoint preserved');
      assert.deepEqual(kept[kept.length - 1], [200, 200], 'end endpoint preserved');
      // every output vertex is an original vertex (subset, never interpolated),
      // lying exactly on one of the straight arms
      kept.forEach(function (p) {
        assert(pts.some(function (q) { return q[0] === p[0] && q[1] === p[1]; }),
          'invented vertex ' + p);
        assert(p[1] === 0 || p[0] === 200, 'vertex off the straight arms: ' + p);
      });
    });

    // The reprojection safeguard: a long line that is straight in lng/lat still
    // curves in the geocentric smoothing space, so resampling a structural run in
    // that space retains interior vertices (scaling with length) rather than
    // collapsing to its two endpoints -- keeping it approximable after reprojection
    // -- while only ever keeping a subset of the original vertices (no rhumb/
    // geodesic distortion from interpolation).
    it('keeps interior vertices along a long lat-long structural run', async function () {
      var line = [];
      for (var lng = -80; lng <= 80 + 1e-9; lng += 0.5) line.push([lng, 45]); // parallel
      var kept = await smoothLine(line, '50km no-prefilter');
      assert(kept.length > 2, 'long lat-long line collapsed to its endpoints (' + kept.length + ')');
      kept.forEach(function (p) {
        assert(line.some(function (q) { return q[0] === p[0] && q[1] === p[1]; }),
          'invented vertex ' + p + ' (should be a subset of the original)');
      });
    });

    it('preserves a corner where a parallel meets a meridian (spherical)', async function () {
      var c = [];
      for (var lng = 0; lng <= 20; lng += 1) c.push([lng, 10]);        // parallel (curved in 3D)
      for (var lat = 11; lat <= 30; lat += 1) c.push([20, lat]);       // meridian
      var kept = await smoothLine(c, '100km');            // default spherical
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
      var out = await api.applyCommands('-i in.json -smooth distance=2 planar -o out.json',
        {'in.json': JSON.stringify(input)});
      var ds1 = I.importGeoJSON(JSON.parse(out['out.json']), {});
      I.buildTopology(ds1);
      assert.equal(ds1.arcs.size(), arcCount0, 'shared boundary should stay coincident');
      assert(!isNaN(sharedFwd[0][0]));
    });
  });

  // A closed ring smaller than the smoothing distance used to collapse toward its
  // centroid (the kernel window spanned the whole loop). Two things prevent that
  // now: the scale cap holds the window just below the ring's size (so the shape
  // survives), and the ring is rescaled about its centroid afterward to restore
  // the enclosed area the smoothing shed -- so a small island is rounded at close
  // to the full requested scale without shrinking.
  describe('small closed rings (resolution cap + area restore)', function () {
    function planarArea(ring) {
      var a = 0;
      for (var i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      return Math.abs(a / 2);
    }
    function squareRing(side) {
      return [[0, 0], [side, 0], [side, side], [0, side], [0, 0]];
    }
    function ptsFrom(out) {
      return out.xx.map(function(x, i) { return [x, out.yy[i]]; });
    }

    it('preserves the area of a closed ring smaller than the smoothing distance', function () {
      // small square, perimeter 400: at tol >> perimeter the kernel window would
      // otherwise span the whole loop and pull it toward the centroid. The cap
      // plus the area restore should hold the enclosed area at ~100%.
      var ring = squareRing(100);
      var xx = ring.map(function(p) { return p[0]; }), yy = ring.map(function(p) { return p[1]; });
      var orig = planarArea(ring);
      [200, 500, 1000, 5000].forEach(function(tol) {
        var out = smoothArcCoords(xx, yy, {tolerance: tol, method: 'gaussian', planar: true, closed: true, keepCorners: false});
        var frac = planarArea(ptsFrom(out)) / orig;
        assert(Math.abs(frac - 1) < 0.02, 'tol=' + tol + ' changed the ring area to ' + (100 * frac).toFixed(1) + '%');
      });
    });

    it('restores area by a similarity transform (an elongated ring stays elongated)', function () {
      // 200x40 rectangle (aspect 5:1): smoothing at a capped distance rounds the
      // corners and would shrink it; the area restore rescales it about its
      // centroid, which is uniform, so it must not turn into a fat blob -- the
      // bounding-box aspect ratio should stay well above 1.
      var ring = [[0, 0], [200, 0], [200, 40], [0, 40], [0, 0]];
      var xx = ring.map(function(p) { return p[0]; }), yy = ring.map(function(p) { return p[1]; });
      var out = smoothArcCoords(xx, yy, {tolerance: 2000, method: 'gaussian', planar: true, closed: true, keepCorners: false});
      var pts = ptsFrom(out);
      var frac = planarArea(pts) / planarArea(ring);
      assert(Math.abs(frac - 1) < 0.02, 'area not preserved (' + (100 * frac).toFixed(1) + '%)');
      var xs = pts.map(function(p) { return p[0]; }), ys = pts.map(function(p) { return p[1]; });
      var aspect = (Math.max.apply(null, xs) - Math.min.apply(null, xs)) /
                   (Math.max.apply(null, ys) - Math.min.apply(null, ys));
      assert(aspect > 3, 'elongated ring was over-rounded into a blob (aspect ' + aspect.toFixed(1) + ')');
    });

    it('still rounds the ring even when the scale is capped', function () {
      var ring = squareRing(100);
      var xx = ring.map(function(p) { return p[0]; }), yy = ring.map(function(p) { return p[1]; });
      var out = smoothArcCoords(xx, yy, {tolerance: 5000, method: 'gaussian', planar: true, closed: true, keepCorners: false});
      // rounding the four 90-degree corners adds vertices; a left-unsmoothed ring
      // would still have ~4.
      assert(out.xx.length > 8, 'ring was left unsmoothed (' + out.xx.length + ' verts)');
    });

    it('does not clamp a large ring (cap is a no-op when perimeter >> distance)', function () {
      // big square (perimeter 40000): tol=100 is far below the cap (0.3*40000),
      // so only the corners round and the area barely changes -- normal smoothing.
      var ring = squareRing(10000);
      var xx = ring.map(function(p) { return p[0]; }), yy = ring.map(function(p) { return p[1]; });
      var out = smoothArcCoords(xx, yy, {tolerance: 100, method: 'gaussian', planar: true, closed: true, keepCorners: false});
      var frac = planarArea(ptsFrom(out)) / planarArea(ring);
      assert(frac > 0.99, 'large ring should be nearly unchanged (' + (100 * frac).toFixed(1) + '%)');
    });

    it('keeps the x_detail1 islands from shrinking at large distances', async function () {
      var input = fs.readFileSync('test/data/features/smooth/x_detail1.json', 'utf8');
      function ringsOf(str) {
        var gj = JSON.parse(str);
        return (gj.features || gj.geometries).map(function(f) { return (f.geometry || f).coordinates; });
      }
      function sphArea(ring) {
        var lat = ring[0][1] * Math.PI / 180, mx = 111320 * Math.cos(lat), my = 110540, a = 0;
        for (var i = 0; i < ring.length - 1; i++) a += ring[i][0] * mx * ring[i + 1][1] * my - ring[i + 1][0] * mx * ring[i][1] * my;
        return Math.abs(a / 2);
      }
      var orig = ringsOf(input);
      for (var d of ['10km', '20km']) {
        var out = await api.applyCommands('-i in.json -smooth ' + d + ' no-corners no-prefilter -o out.json', {'in.json': input});
        var rings = ringsOf(out['out.json']);
        assert.equal(rings.length, orig.length, d + ' dropped an island');
        for (var i = 0; i < rings.length; i++) {
          var frac = sphArea(rings[i]) / sphArea(orig[i]);
          assert(frac > 0.9, d + ' island ' + i + ' shrank to ' + (100 * frac).toFixed(0) + '%');
        }
      }
    });
  });

  // Undocumented `strength` multiplier: scales only the low-pass kernel relative
  // to the distance, so users can dial the smoothing effect up or down without
  // touching the other distance-keyed behaviours (corner detection, prefilter).
  describe('smoothing strength option', function () {
    function wigglyLine() {
      var c = [];
      for (var x = 0; x <= 2000; x += 10) c.push([x, 40 * Math.sin(2 * Math.PI * x / 200)]);
      return c;
    }

    it('defaults to 1 (omitting it matches strength=1)', async function () {
      var line = wigglyLine();
      var base = await smoothLine(line, '25 planar no-corners no-prefilter');
      var explicit = await smoothLine(line, '25 planar no-corners no-prefilter strength=1');
      assert.deepEqual(explicit, base);
    });

    it('strength>1 smooths more strongly (larger divergence from the original)', async function () {
      var line = wigglyLine();
      var weak = await smoothLine(line, '25 planar no-corners no-prefilter strength=1');
      var strong = await smoothLine(line, '25 planar no-corners no-prefilter strength=3');
      assert(maxDeviation(line, strong) > maxDeviation(line, weak) * 1.3,
        'strength=3 should diverge more (weak ' + maxDeviation(line, weak).toFixed(0) +
        ', strong ' + maxDeviation(line, strong).toFixed(0) + ')');
    });

    it('strength<1 smooths more gently (smaller divergence)', async function () {
      var line = wigglyLine();
      var base = await smoothLine(line, '25 planar no-corners no-prefilter strength=1');
      var gentle = await smoothLine(line, '25 planar no-corners no-prefilter strength=0.5');
      assert(maxDeviation(line, gentle) < maxDeviation(line, base),
        'strength=0.5 should diverge less');
    });

    it('does not change corner detection (structural corners stay pinned)', async function () {
      // rounded-rectangle: the four corners are pinned by corner detection, which
      // keys off the distance, not strength -- so they survive at any strength.
      var ring = [];
      for (var x = 0; x <= 200; x += 5) ring.push([x, 0]);
      for (var y = 5; y <= 100; y += 5) ring.push([200, y]);
      for (var x2 = 195; x2 >= 0; x2 -= 5) ring.push([x2, 100]);
      for (var y2 = 95; y2 >= 0; y2 -= 5) ring.push([0, y2]);
      ring.push([0, 0]);
      var gj = {type: 'FeatureCollection', features: [{type: 'Feature', properties: {},
        geometry: {type: 'Polygon', coordinates: [ring]}}]};
      function nearest(pt, pts) {
        var best = Infinity;
        pts.forEach(function(p) { best = Math.min(best, Math.hypot(p[0] - pt[0], p[1] - pt[1])); });
        return best;
      }
      for (var s of [1, 3]) {
        var out = await api.applyCommands('-i in.json -smooth 20 planar strength=' + s + ' -o out.json',
          {'in.json': JSON.stringify(gj)});
        var kept = getCoords(JSON.parse(out['out.json']))[0];
        [[0, 0], [200, 0], [200, 100], [0, 100]].forEach(function(corner) {
          assert(nearest(corner, kept) < 1e-9, 'strength=' + s + ' dropped corner ' + corner);
        });
      }
    });

    it('cannot collapse a small ring even at high strength (cap still applies)', function () {
      var ring = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
      var xx = ring.map(function(p) { return p[0]; }), yy = ring.map(function(p) { return p[1]; });
      function area(pts) {
        var a = 0;
        for (var i = 0; i < pts.length - 1; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
        return Math.abs(a / 2);
      }
      var out = smoothArcCoords(xx, yy, {tolerance: 1000, method: 'gaussian', planar: true, closed: true, keepCorners: false, strength: 10});
      var frac = area(out.xx.map(function(x, i) { return [x, out.yy[i]]; })) / area(ring);
      assert(Math.abs(frac - 1) < 0.02, 'strength=10 changed the small ring area to ' + (100 * frac).toFixed(1) + '%');
    });
  });
});
