import { distance2D, pointSegDistSq2 } from '../geom/mapshaper-basic-geom';

// Chunk size for the per-ring source segment index used by wedgeIsExposed().
var WEDGE_SEGMENT_CHUNK_SIZE = 48;

// Build a flat segment index for a source path vertex list (one ring). Each chunk
// stores up to WEDGE_SEGMENT_CHUNK_SIZE consecutive segments with a bounding box
// so probeIsExposed() can skip segments far from the probe.
export function buildVertsSegmentIndex(verts, chunkSize) {
  chunkSize = chunkSize || WEDGE_SEGMENT_CHUNK_SIZE;
  var coords = [];
  var chunks = [];
  var n = verts.length;
  if (n < 2) return {coords: coords, chunks: chunks};
  var inChunk = 0;
  var chunkSegStart = 0;
  var start = 0;
  var xmin = 0, ymin = 0, xmax = 0, ymax = 0;
  var ax, ay, bx, by, i;
  for (i = 0; i < n - 1; i++) {
    ax = verts[i][0];
    ay = verts[i][1];
    bx = verts[i + 1][0];
    by = verts[i + 1][1];
    if (inChunk === 0) {
      chunkSegStart = i;
      start = coords.length / 4;
      xmin = Math.min(ax, bx);
      xmax = Math.max(ax, bx);
      ymin = Math.min(ay, by);
      ymax = Math.max(ay, by);
    } else {
      if (ax < xmin) xmin = ax; else if (ax > xmax) xmax = ax;
      if (bx < xmin) xmin = bx; else if (bx > xmax) xmax = bx;
      if (ay < ymin) ymin = ay; else if (ay > ymax) ymax = ay;
      if (by < ymin) ymin = by; else if (by > ymax) ymax = by;
    }
    coords.push(ax, ay, bx, by);
    inChunk++;
    if (inChunk === chunkSize) {
      chunks.push({
        start: start,
        end: coords.length / 4,
        segStart: chunkSegStart,
        segEnd: i + 1,
        xmin: xmin, ymin: ymin, xmax: xmax, ymax: ymax
      });
      inChunk = 0;
    }
  }
  if (inChunk > 0) {
    chunks.push({
      start: start,
      end: coords.length / 4,
      segStart: chunkSegStart,
      segEnd: n - 1,
      xmin: xmin, ymin: ymin, xmax: xmax, ymax: ymax
    });
  }
  return {coords: coords, chunks: chunks};
}

// True if any point of the round-join wedge at a fan-apart concave bend is NOT
// covered by another source segment. Probes the concave-bridge arc plus the two
// offset tips; tips alone miss bends whose tips are covered but whose arc flank
// is still exposed (see idaho 150km regression).
export function wedgeIsExposed(index, skipA, skipB, vx, vy, arc, tipA, tipB) {
  var i;
  if (probeIsExposed(index, skipA, skipB, vx, vy, tipA) ||
      probeIsExposed(index, skipA, skipB, vx, vy, tipB)) {
    return true;
  }
  for (i = 0; i < arc.length; i++) {
    if (probeIsExposed(index, skipA, skipB, vx, vy, arc[i])) return true;
  }
  return false;
}

export function probeIsExposed(index, skipA, skipB, vx, vy, p) {
  var r = distance2D(vx, vy, p[0], p[1]);
  if (!(r > 0)) return false;
  var r2 = r * r * 0.98 * 0.98;
  var px = p[0], py = p[1];
  var chunks = index.chunks;
  var coords = index.coords;
  var c, chunk, s, o, d;
  for (c = 0; c < chunks.length; c++) {
    chunk = chunks[c];
    if (chunkBoxDistSq(px, py, chunk) >= r2) continue;
    for (s = chunk.segStart; s < chunk.segEnd; s++) {
      if (s === skipA || s === skipB) continue;
      o = (chunk.start + (s - chunk.segStart)) * 4;
      d = pointSegDistSq2(px, py, coords[o], coords[o + 1], coords[o + 2], coords[o + 3]);
      if (d < r2) return false;
    }
  }
  return true;
}

function chunkBoxDistSq(px, py, chunk) {
  var dx = px < chunk.xmin ? chunk.xmin - px : (px > chunk.xmax ? px - chunk.xmax : 0);
  var dy = py < chunk.ymin ? chunk.ymin - py : (py > chunk.ymax ? py - chunk.ymax : 0);
  return dx * dx + dy * dy;
}

// Brute-force reference for tests (same semantics as probeIsExposed).
export function probeIsExposedBrute(verts, skipA, skipB, vx, vy, p) {
  var r = distance2D(vx, vy, p[0], p[1]);
  if (!(r > 0)) return false;
  var r2 = r * r * 0.98 * 0.98;
  var px = p[0], py = p[1];
  var s, d;
  for (s = 0; s < verts.length - 1; s++) {
    if (s === skipA || s === skipB) continue;
    d = pointSegDistSq2(px, py, verts[s][0], verts[s][1], verts[s + 1][0], verts[s + 1][1]);
    if (d < r2) return false;
  }
  return true;
}
