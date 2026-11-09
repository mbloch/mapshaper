import { forEachSegmentInPath } from '../paths/mapshaper-path-utils';

// Returns one byte per pixel of @grid: 1 if the pixel's center is inside the
// polygons of @lyr, else 0. Uses the nonzero winding rule, so holes are
// excluded and overlapping features are included. @grid must be north-up.
export function getPolygonPixelMask(grid, lyr, arcs) {
  var w = grid.width, h = grid.height, bb = grid.bbox;
  var kx = w / (bb[2] - bb[0]), ky = h / (bb[3] - bb[1]);
  var mask = new Uint8Array(w * h);
  var edges = [];
  (lyr.shapes || []).forEach(function(shp) {
    for (var i = 0, n = shp ? shp.length : 0; i < n; i++) {
      forEachSegmentInPath(shp[i], arcs, addEdge);
    }
  });
  fillEdges(mask, w, h, edges);
  return mask;

  function addEdge(a, b, xx, yy) {
    edges.push((xx[a] - bb[0]) * kx, (bb[3] - yy[a]) * ky,
      (xx[b] - bb[0]) * kx, (bb[3] - yy[b]) * ky);
  }
}

// @edges: flat array of x0, y0, x1, y1 in pixel units (y increasing down)
function fillEdges(mask, w, h, edges) {
  // Crossings of each row's center line, stored by row, and kept in two
  // sets (by edge direction) so each row can be sorted with a numeric
  // typed-array sort and then merged.
  var down = indexCrossings(edges, h, 1);
  var up = indexCrossings(edges, h, -1);
  var y, a, b, i, j, winding, prev, x, start;
  for (y = 0; y < h; y++) {
    a = down.xx.subarray(down.offsets[y], down.offsets[y + 1]).sort();
    b = up.xx.subarray(up.offsets[y], up.offsets[y + 1]).sort();
    i = j = winding = 0;
    while (i < a.length || j < b.length) {
      prev = winding;
      if (j == b.length || i < a.length && a[i] <= b[j]) {
        x = a[i++];
        winding++;
      } else {
        x = b[j++];
        winding--;
      }
      if (prev === 0) {
        start = x;
      } else if (winding === 0) {
        fillSpan(mask, w, y, start, x);
      }
    }
  }
}

// A row's center line (y + 0.5) crosses an edge if ymin <= y + 0.5 < ymax, so
// a vertex lying on the line is counted once.
function getEdgeRows(y0, y1, h) {
  var ymin = Math.min(y0, y1), ymax = Math.max(y0, y1);
  var r0 = Math.max(0, Math.ceil(ymin - 0.5));
  var r1 = Math.min(h - 1, Math.ceil(ymax - 0.5) - 1);
  return r0 <= r1 ? [r0, r1] : null;
}

function indexCrossings(edges, h, dir) {
  var offsets = new Uint32Array(h + 1);
  var fillCounts, xx, i, r, rows, x0, y0, x1, y1;
  for (i = 0; i < edges.length; i += 4) {
    if ((edges[i + 3] > edges[i + 1] ? 1 : -1) != dir) continue;
    rows = getEdgeRows(edges[i + 1], edges[i + 3], h);
    if (!rows) continue;
    for (r = rows[0]; r <= rows[1]; r++) offsets[r + 1]++;
  }
  for (r = 0; r < h; r++) offsets[r + 1] += offsets[r];
  xx = new Float64Array(offsets[h]);
  fillCounts = offsets.slice(0, h);
  for (i = 0; i < edges.length; i += 4) {
    x0 = edges[i]; y0 = edges[i + 1]; x1 = edges[i + 2]; y1 = edges[i + 3];
    if ((y1 > y0 ? 1 : -1) != dir) continue;
    rows = getEdgeRows(y0, y1, h);
    if (!rows) continue;
    for (r = rows[0]; r <= rows[1]; r++) {
      xx[fillCounts[r]++] = x0 + (r + 0.5 - y0) * (x1 - x0) / (y1 - y0);
    }
  }
  return {offsets: offsets, xx: xx};
}

// Marks the pixels whose centers are in [x0, x1)
function fillSpan(mask, w, y, x0, x1) {
  var c0 = Math.max(0, Math.ceil(x0 - 0.5));
  var c1 = Math.min(w, Math.ceil(x1 - 0.5));
  if (c1 > c0) mask.fill(1, y * w + c0, y * w + c1);
}
