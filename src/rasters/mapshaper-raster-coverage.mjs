import { forEachSegmentInPath } from '../paths/mapshaper-path-utils';

// Values this close to 0 or 1 are rounding error, so a pixel well inside a
// polygon gets a weight of exactly 1.
var COVERAGE_EPSILON = 1e-9;

// Returns the fraction of each pixel in @win (a window of whole pixels, see
// getRasterCrop()) that is inside polygon @shp, as a Float64Array with one
// value per pixel of the window. Holes are excluded. Where parts of a shape
// overlap, a pixel's coverage is capped at 1. @grid must be north-up.
//
// Method: within one row of pixels, the area of the polygon to the left of
// a vertical line x = X is the integral of the winding number, which is a sum
// over the edges of dy * clamp(X - x, 0, ...). Differencing at the pixel's
// two sides gives each edge's contribution to a pixel: none if the edge is to
// its right, its full signed height dy if the edge is to its left, and the
// partial area dy * (right side - mean x) if the edge crosses the pixel. So
// edges are cut into pieces that each lie within one pixel. A piece adds its
// partial area to that pixel, and its full height to a running sum that is
// added to every pixel to its right.
export function getShapePixelCoverage(grid, shp, arcs, win) {
  var w = win.width, h = win.height, bb = grid.bbox;
  var kx = grid.width / (bb[2] - bb[0]), ky = grid.height / (bb[3] - bb[1]);
  var cover = new Float64Array(w * h);
  var delta = new Float64Array((w + 1) * h);
  var coverage = new Float64Array(w * h);
  var r, c, sum, val;
  for (var i = 0, n = shp ? shp.length : 0; i < n; i++) {
    forEachSegmentInPath(shp[i], arcs, addEdge);
  }
  for (r = 0; r < h; r++) {
    sum = 0;
    for (c = 0; c < w; c++) {
      sum += delta[r * (w + 1) + c];
      val = Math.abs(cover[r * w + c] + sum);
      coverage[r * w + c] = val < COVERAGE_EPSILON ? 0 :
        val > 1 - COVERAGE_EPSILON ? 1 : val;
    }
  }
  return coverage;

  // Converts an edge to the pixel units of the window (y increasing down)
  function addEdge(a, b, xx, yy) {
    addSegment((xx[a] - bb[0]) * kx - win.x, (bb[3] - yy[a]) * ky - win.y,
      (xx[b] - bb[0]) * kx - win.x, (bb[3] - yy[b]) * ky - win.y);
  }

  // Cuts a segment at the rows of the window
  function addSegment(x0, y0, x1, y1) {
    var dir = y1 > y0 ? 1 : -1;
    var ymin = Math.max(0, Math.min(y0, y1));
    var ymax = Math.min(h, Math.max(y0, y1));
    var slope, row, ya, yb;
    if (ymax <= ymin) return; // horizontal, or outside the window
    slope = (x1 - x0) / (y1 - y0);
    for (row = Math.floor(ymin); row < ymax; row++) {
      ya = Math.max(row, ymin);
      yb = Math.min(row + 1, ymax);
      if (yb > ya) {
        addRowPiece(row, x0 + (ya - y0) * slope, x0 + (yb - y0) * slope, (yb - ya) * dir);
      }
    }
  }

  // Cuts a piece of a segment within row @r at the columns of the window.
  // @dy: signed height of the piece
  function addRowPiece(r, xa, xb, dy) {
    var xl = Math.min(xa, xb), xr = Math.max(xa, xb);
    var len = xr - xl;
    var k, k1, x0, x1;
    if (len === 0) {
      addCellPiece(r, Math.floor(xl), xl, dy);
      return;
    }
    // Pieces left of the window cover every pixel in the row; pieces to the
    // right of it cover none.
    if (xl < 0) {
      addCellPiece(r, -1, 0, dy * (Math.min(xr, 0) - xl) / len);
    }
    k1 = Math.min(w - 1, Math.floor(xr));
    for (k = Math.max(0, Math.floor(xl)); k <= k1; k++) {
      x0 = Math.max(xl, k);
      x1 = Math.min(xr, k + 1);
      if (x1 > x0) {
        addCellPiece(r, k, (x0 + x1) / 2, dy * (x1 - x0) / len);
      }
    }
  }

  // @k: column containing the piece, @xmid: its mean x
  function addCellPiece(r, k, xmid, dy) {
    if (k >= w) return;
    if (k < 0) {
      delta[r * (w + 1)] += dy;
      return;
    }
    cover[r * w + k] += dy * (k + 1 - xmid);
    delta[r * (w + 1) + k + 1] += dy;
  }
}
