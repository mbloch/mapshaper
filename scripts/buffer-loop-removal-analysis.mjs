import fs from 'fs';
import api from '../mapshaper.js';

var BUFFER_DIR = 'test/data/features/buffer';
var CASES = [
  {
    name: 'm_loops_1_5km',
    input: BUFFER_DIR + '/m_loops.json',
    buffer: '1.5km',
    tolerance: '0'
  },
  {
    name: 'greenland_full_15000',
    input: BUFFER_DIR + '/__greenland_merc.json',
    buffer: '15000',
    markerFile: BUFFER_DIR + '/__greenland_merc_15000_errors.json'
  },
  {
    name: 'greenland_open_15000',
    input: BUFFER_DIR + '/__greenland_merc_open.json',
    buffer: '15000',
    markerFile: BUFFER_DIR + '/__greenland_merc_open_15000_errors.json'
  }
];

main().catch(function(e) {
  console.error(e.stack || e.message || e);
  process.exit(1);
});

async function main() {
  var results = [];
  for (var i = 0; i < CASES.length; i++) {
    if (!fs.existsSync(CASES[i].input)) continue;
    results.push(await analyzeCase(CASES[i]));
  }
  console.log(JSON.stringify(results, null, 2));
}

async function analyzeCase(def) {
  var markers = readMarkers(def.markerFile);
  var base = '-i ' + def.input + ' -buffer ' + def.buffer +
    (def.tolerance ? ' tolerance=' + def.tolerance : '');
  var current = await runGeoJSON(base + ' -o format=geojson out.json');
  var noLoop = await runGeoJSON(base + ' no-loop-removal -o format=geojson out.json');
  var currentDebug = await runGeoJSON(base + ' debug-offset -o format=geojson out.json');
  var rawDebug = await runGeoJSON(base + ' debug-offset no-loop-removal -o format=geojson out.json');
  var rawRings = getRings(rawDebug);
  var crossings = markers.length > 0 ?
    nearestCrossings(rawRings, markers, 30, 10) : [];
  return {
    name: def.name,
    input: def.input,
    buffer: def.buffer,
    current: metrics(current, markers),
    noLoopRemoval: metrics(noLoop, markers),
    debugVertices: {
      current: countRingPoints(currentDebug),
      noLoopRemoval: countRingPoints(rawDebug),
      removed: countRingPoints(rawDebug) - countRingPoints(currentDebug)
    },
    nearbyRawCrossings: crossings
  };
}

async function runGeoJSON(cmd) {
  var out = await api.applyCommands(cmd);
  return JSON.parse(out['out.json']);
}

function readMarkers(file) {
  if (!file || !fs.existsSync(file)) return [];
  var gj = JSON.parse(fs.readFileSync(file, 'utf8'));
  return getGeometries(gj).filter(function(g) {
    return g.type === 'Point';
  }).map(function(g) {
    return g.coordinates;
  });
}

function metrics(gj, markers) {
  var geoms = getGeometries(gj);
  return {
    polygonCount: countPolygons(geoms),
    holeCount: countHoles(geoms),
    ringCount: getRings(gj).length,
    ringPointCount: countRingPoints(gj),
    markerContainment: markers.map(function(p) {
      return geometryArrayContainsPoint(geoms, p);
    })
  };
}

function getGeometries(gj) {
  if (gj.type === 'FeatureCollection') {
    return gj.features.map(function(f) { return f.geometry; }).filter(Boolean);
  }
  if (gj.type === 'GeometryCollection') return gj.geometries;
  if (gj.type === 'Feature') return gj.geometry ? [gj.geometry] : [];
  return [gj];
}

function getRings(gj) {
  var rings = [];
  getGeometries(gj).forEach(function(g) {
    var polys = g.type === 'Polygon' ? [g.coordinates] :
      g.type === 'MultiPolygon' ? g.coordinates : [];
    polys.forEach(function(poly) {
      poly.forEach(function(ring) {
        rings.push(ring);
      });
    });
  });
  return rings;
}

function countPolygons(geoms) {
  var count = 0;
  geoms.forEach(function(g) {
    count += g.type === 'Polygon' ? 1 :
      g.type === 'MultiPolygon' ? g.coordinates.length : 0;
  });
  return count;
}

function countHoles(geoms) {
  var count = 0;
  geoms.forEach(function(g) {
    var polys = g.type === 'Polygon' ? [g.coordinates] :
      g.type === 'MultiPolygon' ? g.coordinates : [];
    polys.forEach(function(poly) {
      count += Math.max(0, poly.length - 1);
    });
  });
  return count;
}

function countRingPoints(gj) {
  return getRings(gj).reduce(function(sum, ring) {
    return sum + ring.length;
  }, 0);
}

function geometryArrayContainsPoint(geoms, p) {
  return geoms.some(function(g) {
    return geometryContainsPoint(g, p);
  });
}

function geometryContainsPoint(g, p) {
  var polys = g.type === 'Polygon' ? [g.coordinates] :
    g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.some(function(poly) {
    if (!ringContainsPoint(poly[0], p)) return false;
    for (var i = 1; i < poly.length; i++) {
      if (ringContainsPoint(poly[i], p)) return false;
    }
    return true;
  });
}

function ringContainsPoint(ring, p) {
  var inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    var a = ring[i], b = ring[j];
    if (((a[1] > p[1]) !== (b[1] > p[1])) &&
        p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

function nearestCrossings(rings, markers, windowSize, maxResults) {
  var results = [];
  rings.forEach(function(ring, ringId) {
    collectCrossings(ring, windowSize).forEach(function(c) {
      markers.forEach(function(p, markerId) {
        results.push(Object.assign({
          markerId: markerId,
          ringId: ringId,
          distance: distanceToCandidate(p, c, ring)
        }, c));
      });
    });
  });
  results.sort(function(a, b) {
    return a.distance - b.distance;
  });
  return results.slice(0, maxResults).map(function(c) {
    return {
      markerId: c.markerId,
      ringId: c.ringId,
      distance: round(c.distance),
      segmentA: c.i,
      segmentB: c.j,
      gap: c.j - c.i,
      area: round(c.area),
      crossSign: c.crossSign
    };
  });
}

function collectCrossings(ring, windowSize) {
  var n = ring.length - 1;
  var arr = [];
  for (var i = 0; i < n; i++) {
    for (var j = i + 2; j <= Math.min(n - 2, i + windowSize); j++) {
      var hit = segHit(ring[i], ring[i + 1], ring[j], ring[j + 1]);
      if (hit) {
        arr.push({
          i: i,
          j: j,
          hit: hit.point,
          crossSign: hit.den > 0 ? 1 : -1,
          area: candidateArea(ring, i, j, hit.point)
        });
      }
    }
  }
  return arr;
}

function segHit(a, b, c, d) {
  if (a[0] < c[0] && a[0] < d[0] && b[0] < c[0] && b[0] < d[0] ||
      a[0] > c[0] && a[0] > d[0] && b[0] > c[0] && b[0] > d[0] ||
      a[1] < c[1] && a[1] < d[1] && b[1] < c[1] && b[1] < d[1] ||
      a[1] > c[1] && a[1] > d[1] && b[1] > c[1] && b[1] > d[1]) return null;
  var abx = b[0] - a[0], aby = b[1] - a[1];
  var cdx = d[0] - c[0], cdy = d[1] - c[1];
  var den = abx * cdy - aby * cdx;
  if (den === 0) return null;
  var acx = c[0] - a[0], acy = c[1] - a[1];
  var t = (acx * cdy - acy * cdx) / den;
  var u = (acx * aby - acy * abx) / den;
  if (t <= 1e-9 || t >= 1 - 1e-9 || u <= 1e-9 || u >= 1 - 1e-9) return null;
  return {point: [a[0] + t * abx, a[1] + t * aby], den: den};
}

function candidateArea(ring, i, j, hit) {
  var area = 0;
  var prev = hit;
  for (var k = i + 1; k <= j; k++) {
    area += prev[0] * ring[k][1] - ring[k][0] * prev[1];
    prev = ring[k];
  }
  area += prev[0] * hit[1] - hit[0] * prev[1];
  return area / 2;
}

function distanceToCandidate(p, c, ring) {
  var best = dist2(p, c.hit);
  var prev = c.hit;
  for (var k = c.i + 1; k <= c.j; k++) {
    best = Math.min(best, dist2(p, ring[k]), segDist2(p, prev, ring[k]));
    prev = ring[k];
  }
  best = Math.min(best, segDist2(p, prev, c.hit));
  return Math.sqrt(best);
}

function dist2(a, b) {
  var dx = a[0] - b[0], dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function segDist2(p, a, b) {
  var dx = b[0] - a[0], dy = b[1] - a[1];
  var len2 = dx * dx + dy * dy;
  var t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return dist2(p, [a[0] + t * dx, a[1] + t * dy]);
}

function round(val) {
  return Math.round(val * 1000) / 1000;
}
