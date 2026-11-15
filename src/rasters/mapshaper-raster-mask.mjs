import { forEachSegmentInPath } from '../paths/mapshaper-path-utils';

// Returns one byte per pixel of @grid: 1 if the pixel's center is inside the
// polygons of @lyr, else 0. Uses the nonzero winding rule, so holes are
// excluded and overlapping features are included. @grid must be north-up.
export function getPolygonPixelMask(grid, lyr, arcs) {
  var win = {x: 0, y: 0, width: grid.width, height: grid.height};
  return getPixelMask(grid, lyr.shapes || [], arcs, win);
}

// Like getPolygonPixelMask(), for a single shape and the pixels in @win, a
// window of whole pixels (see getRasterCrop()). The mask has one byte per
// pixel of the window. A pixel center on the boundary between two shapes is
// inside exactly one of them, whatever windows the two masks use.
export function getShapePixelMask(grid, shp, arcs, win) {
  return getPixelMask(grid, shp ? [shp] : [], arcs, win);
}

function getPixelMask(grid, shapes, arcs, win) {
  var bb = grid.bbox;
  var kx = grid.width / (bb[2] - bb[0]), ky = grid.height / (bb[3] - bb[1]);
  var mask = new Uint8Array(win.width * win.height);
  var edges = [];
  shapes.forEach(function(shp) {
    for (var i = 0, n = shp ? shp.length : 0; i < n; i++) {
      forEachSegmentInPath(shp[i], arcs, addEdge);
    }
  });
  fillEdges(mask, win, edges);
  return mask;

  // Edges are kept in the pixel coordinates of the whole grid, so that the
  // same edge yields the same crossings in any window.
  function addEdge(a, b, xx, yy) {
    edges.push((xx[a] - bb[0]) * kx, (bb[3] - yy[a]) * ky,
      (xx[b] - bb[0]) * kx, (bb[3] - yy[b]) * ky);
  }
}

// @edges: flat array of x0, y0, x1, y1 in grid pixel units (y increasing down)
function fillEdges(mask, win, edges) {
  // Crossings of each row's center line, stored by row, and kept in two
  // sets (by edge direction) so each row can be sorted with a numeric
  // typed-array sort and then merged.
  var down = indexCrossings(edges, win, 1);
  var up = indexCrossings(edges, win, -1);
  var y, a, b, i, j, winding, prev, x, start;
  for (y = 0; y < win.height; y++) {
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
        fillSpan(mask, win, y, start, x);
      }
    }
  }
}

// A row's center line (y + 0.5) crosses an edge if ymin <= y + 0.5 < ymax, so
// a vertex lying on the line is counted once. Returns the window rows crossed.
function getEdgeRows(y0, y1, win) {
  var ymin = Math.min(y0, y1), ymax = Math.max(y0, y1);
  var r0 = Math.max(win.y, Math.ceil(ymin - 0.5));
  var r1 = Math.min(win.y + win.height - 1, Math.ceil(ymax - 0.5) - 1);
  return r0 <= r1 ? [r0 - win.y, r1 - win.y] : null;
}

function indexCrossings(edges, win, dir) {
  var h = win.height;
  var offsets = new Uint32Array(h + 1);
  var fillCounts, xx, i, r, rows, x0, y0, x1, y1;
  for (i = 0; i < edges.length; i += 4) {
    if ((edges[i + 3] > edges[i + 1] ? 1 : -1) != dir) continue;
    rows = getEdgeRows(edges[i + 1], edges[i + 3], win);
    if (!rows) continue;
    for (r = rows[0]; r <= rows[1]; r++) offsets[r + 1]++;
  }
  for (r = 0; r < h; r++) offsets[r + 1] += offsets[r];
  xx = new Float64Array(offsets[h]);
  fillCounts = offsets.slice(0, h);
  for (i = 0; i < edges.length; i += 4) {
    if ((edges[i + 3] > edges[i + 1] ? 1 : -1) != dir) continue;
    rows = getEdgeRows(edges[i + 1], edges[i + 3], win);
    if (!rows) continue;
    // Interpolate from the upper endpoint, so an edge shared by two shapes
    // (and traversed in opposite directions) gives identical crossings.
    if (dir == 1) {
      x0 = edges[i]; y0 = edges[i + 1]; x1 = edges[i + 2]; y1 = edges[i + 3];
    } else {
      x0 = edges[i + 2]; y0 = edges[i + 3]; x1 = edges[i]; y1 = edges[i + 1];
    }
    for (r = rows[0]; r <= rows[1]; r++) {
      xx[fillCounts[r]++] = x0 + (r + win.y + 0.5 - y0) * (x1 - x0) / (y1 - y0);
    }
  }
  return {offsets: offsets, xx: xx};
}

// Marks the pixels whose centers are in [x0, x1) (grid pixel units)
function fillSpan(mask, win, y, x0, x1) {
  var c0 = Math.max(0, Math.ceil(x0 - 0.5) - win.x);
  var c1 = Math.min(win.width, Math.ceil(x1 - 0.5) - win.x);
  if (c1 > c0) mask.fill(1, y * win.width + c0, y * win.width + c1);
}
