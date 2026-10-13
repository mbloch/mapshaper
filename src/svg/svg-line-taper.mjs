import { isSvgNumber } from './svg-properties';

// line-taper= narrows a line toward its tail: 0-1, the share of the line's
// width it loses there, so 1 tapers it to a point and 0.5 to half its width.
// The width changes evenly along the whole line, from the tail to the head,
// which is the start unless only the start has a head (as with line-fade=).
// A tapered line need not have heads.
//
// A line whose width changes can't be stroked, so it is drawn as a fill: the
// outline of a stroke whose width runs from one end's to the other's. The
// outline is built from pieces -- a quadrilateral for each segment, and a join
// at each vertex between segments -- all wound the same way and filled as one
// path with the nonzero rule, so that where they overlap they are simply
// filled. Tracing a single outline around the line would be smaller, but its
// inner side folds over itself at every sharp bend, and the fold leaves a hole.
// One path, rather than a path per piece, keeps a translucent fill even and
// leaves no seams between the pieces.
//
// Its ends are round, as an untapered line's are, unless stroke-linecap= is
// butt or square, which both end it flat. An end with a head is flat.
//
// A dashed tapered line is the same outline, built only along its dashes:
// stroke-dasharray= lengths are px along the line, as for a stroked line,
// and do not shrink with the taper, and the pattern starts at the line's
// first point. The dashes have butt ends, unless stroke-linecap= says
// otherwise, as an untapered dashed line's do.
//
// The canvas in the GUI draws the same pieces (see getArrowLinePencil() in
// gui-canvas.mjs).
//
// Coordinates are px, y down: the SVG export's space, or the canvas's.

// Joins at bends sharper than this are round; gentler ones are beveled,
// which at this angle is within a fiftieth of the width of a round join
var ROUND_JOIN_ANGLE = 10 * Math.PI / 180;

// The share of the width lost at the tail, 0 for none
export function parseLineTaper(val) {
  return isSvgNumber(val) && Number(val) > 0 ? Math.min(Number(val), 1) : 0;
}

// Which ends of a tapered line are round, for a line with stroke-linecap=
// @cap and line-end options @opts (see makeLineArrowOpts()). An end with a
// head has none, since a translucent head would show it.
export function getTaperCaps(cap, opts) {
  var round = !cap || cap == 'round';
  return [round && opts.start == 'none', round && opts.end == 'none'];
}

// The pieces of a tapered line's outline (see getTaperedLinePieces()), with
// its caps and dashes. o.cap: stroke-linecap=; o.dashes: from
// parseDashArray(), or null; o.startHead, o.endHead: whether the ends have
// heads; o.bbox: optional [xmin, ymin, xmax, ymax], outside of which no dashes
// are made (the pieces may still reach past it).
export function getTaperedOutline(coords, startWidth, endWidth, o) {
  var caps;
  if (o.dashes) {
    return getTaperedDashPieces(coords, startWidth, endWidth, o.dashes,
      o.cap || 'butt', [!o.startHead, !o.endHead], o.bbox);
  }
  caps = getTaperCaps(o.cap, {start: o.startHead ? 'arrow' : 'none',
    end: o.endHead ? 'arrow' : 'none'});
  return getTaperedLinePieces(coords, startWidth, endWidth, caps);
}

// The options getTaperedOutline() takes, for a line with stroke-linecap=
// @cap and stroke-dasharray= @dashArray, in px times @scale, and line-end
// options @lineOpts (see makeLineArrowOpts())
export function makeTaperOutlineOpts(cap, dashArray, lineOpts, scale) {
  return {
    cap: cap || null,
    dashes: parseDashArray(dashArray, scale),
    startHead: lineOpts.start != 'none',
    endHead: lineOpts.end != 'none'
  };
}

// A stroke-dasharray= value as a list of px lengths, dash then gap, times
// @scale; null for a solid line. An odd number of lengths is repeated, as in
// SVG.
export function parseDashArray(val, scale) {
  var k = scale > 0 ? scale : 1;
  var parts, sum = 0, i;
  if (val === undefined || val === null || String(val).trim() === '' ||
      String(val).trim() == 'none') return null;
  parts = String(val).trim().split(/[\s,]+/).map(Number);
  for (i = 0; i < parts.length; i++) {
    if (!(parts[i] >= 0) || !isFinite(parts[i])) return null;
    sum += parts[i];
  }
  if (!(sum > 0)) return null;
  if (parts.length % 2 == 1) parts = parts.concat(parts);
  return parts.map(function(n) { return n * k; });
}

// A line with more dashes than this along a stretch of it is drawn solid
// there, rather than as a fill of countless slivers
var MAX_DASHES = 20000;

// The pieces of the dashes of a tapered line. The line is taken a segment at
// a time, with the dashes that overlap it: a dash gets a quadrilateral for its
// stretch of each segment it crosses, a join at each vertex inside it, and its
// caps. @endCaps, [start, end], is whether the line's own ends take a cap. A
// segment is first cut to @bbox (if given), so that zoomed far in, where a
// line can be millions of px long, only the dashes in view are made.
export function getTaperedDashPieces(coords, startWidth, endWidth, dashes, cap, endCaps, bbox) {
  var pts = removeDuplicatePoints(coords);
  var pieces = [];
  var period = dashes.reduce(function(sum, n) { return sum + n; }, 0);
  var total = 0, lengths = [0], maxR, box, i;
  if (pts.length < 2) return pieces;
  for (i = 1; i < pts.length; i++) {
    total += dist(pts[i - 1], pts[i]);
    lengths.push(total);
  }
  maxR = Math.max(startWidth, endWidth) / 2;
  box = bbox ? [bbox[0] - maxR * 2, bbox[1] - maxR * 2, bbox[2] + maxR * 2, bbox[3] + maxR * 2] : null;
  for (i = 1; i < pts.length; i++) {
    addDashedSegment(i);
  }
  return pieces;

  function radiusAt(d) {
    return (startWidth + (endWidth - startWidth) * d / total) / 2;
  }

  function isCapAllowed(d) {
    if (d === 0) return endCaps[0];
    if (d == total) return endCaps[1];
    return true;
  }

  function addDashedSegment(i) {
    var a = pts[i - 1], b = pts[i];
    var la = lengths[i - 1], lb = lengths[i];
    var len = lb - la;
    var range = box ? clipSegmentToBox(a, b, box) : [0, 1];
    var lo, hi;
    if (!range) return;
    lo = la + range[0] * len;
    hi = la + range[1] * len;
    if (Math.ceil((hi - lo) / period) * dashes.length / 2 > MAX_DASHES) {
      addSegment(pieces, pointAt(lo), pointAt(hi), radiusAt(lo), radiusAt(hi));
      if (i < pts.length - 1 && range[1] == 1) {
        addJoin(pieces, a, b, pts[i + 1], radiusAt(lb));
      }
      return;
    }
    forEachDash(lo, hi, function(s, e) {
      var from = Math.max(s, lo), to = Math.min(e, hi);
      if (to > from) {
        addSegment(pieces, pointAt(from), pointAt(to), radiusAt(from), radiusAt(to));
      }
      if (s >= la && (s < lb || s == total)) addCap(s, -1, isCapAllowed(s));
      if (e > la && e <= lb) addCap(e, 1, isCapAllowed(e));
      if (e > lb && i < pts.length - 1 && range[1] == 1) {
        addJoin(pieces, a, b, pts[i + 1], radiusAt(lb));
      }
    });

    // @side: -1 at a dash's start, 1 at its end
    function addCap(d, side, allowed) {
      var p = pointAt(d), r = radiusAt(d), u;
      if (!allowed || !(r > 0) || cap == 'butt') return;
      if (cap == 'round') {
        pieces.push({center: p, radius: r});
      } else if (cap == 'square') {
        u = [(b[0] - a[0]) / len * side * r, (b[1] - a[1]) / len * side * r];
        addSegment(pieces, p, [p[0] + u[0], p[1] + u[1]], r, r);
      }
    }

    function pointAt(d) {
      var k = (d - la) / len;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    }
  }

  // Calls @cb(start, end) for each dash that overlaps the stretch from @lo to
  // @hi, where start and end are distances along the line
  function forEachDash(lo, hi, cb) {
    var base = Math.floor(lo / period) * period;
    var s, e, j;
    for (; base <= hi; base += period) {
      s = base;
      for (j = 0; j < dashes.length; j += 2) {
        e = Math.min(s + dashes[j], total);
        // a dash that starts where the line ends has nothing left of it,
        // though a dot (a dash of no length) is still drawn there
        if (s > hi || s >= total && dashes[j] > 0) return;
        if (e >= lo && (e > s || cap != 'butt')) cb(s, e);
        s += dashes[j] + dashes[j + 1];
      }
    }
  }
}

// The part of the segment from @a to @b inside @box, as [t0, t1], shares of
// the segment's length, or null if none is (Liang-Barsky)
function clipSegmentToBox(a, b, box) {
  var dx = b[0] - a[0], dy = b[1] - a[1];
  var t0 = 0, t1 = 1;
  var p = [-dx, dx, -dy, dy];
  var q = [a[0] - box[0], box[2] - a[0], a[1] - box[1], box[3] - a[1]];
  var r, i;
  for (i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [t0, t1];
}

// The widths of a tapered line at its first and last points, for a line
// @width wide tapered by @taper, whose tail is its last point if @fromEnd.
export function getTaperWidths(width, taper, fromEnd) {
  var tail = width * (1 - taper);
  return fromEnd ? [width, tail] : [tail, width];
}

// The pieces of the outline of a line whose width runs evenly from @startWidth
// at its first point to @endWidth at its last. A piece is {points}, a polygon;
// {center, radius}, a circle; or {center, radius, from, to}, the sector of a
// circle from the point @from to the point @to, in increasing angle, less
// than half the circle. Polygons are wound with a positive area in y-down
// coordinates (clockwise on screen), as a circle or a sector drawn in
// increasing angle is. @roundCaps, [start, end], adds round ends. Empty for a line with
// no length.
export function getTaperedLinePieces(coords, startWidth, endWidth, roundCaps) {
  var pts = removeDuplicatePoints(coords);
  var pieces = [];
  var total = 0, lengths = [0], radii, i, n;
  if (pts.length < 2) return pieces;
  for (i = 1; i < pts.length; i++) {
    total += dist(pts[i - 1], pts[i]);
    lengths.push(total);
  }
  radii = lengths.map(function(len) {
    return (startWidth + (endWidth - startWidth) * len / total) / 2;
  });
  for (i = 1; i < pts.length; i++) {
    addSegment(pieces, pts[i - 1], pts[i], radii[i - 1], radii[i]);
    if (i < pts.length - 1) {
      addJoin(pieces, pts[i - 1], pts[i], pts[i + 1], radii[i]);
    }
  }
  n = pts.length - 1;
  if (roundCaps && roundCaps[0] && radii[0] > 0) {
    pieces.push({center: pts[0], radius: radii[0]});
  }
  if (roundCaps && roundCaps[1] && radii[n] > 0) {
    pieces.push({center: pts[n], radius: radii[n]});
  }
  return pieces;
}

// The pieces as an SVG path's d attribute, rounded to hundredths of a px
export function getTaperedLinePathData(pieces) {
  return pieces.map(function(piece) {
    var c, r;
    if (piece.points) {
      return 'M ' + piece.points.map(fmt).join(' L ') + ' Z';
    }
    c = piece.center;
    r = round(piece.radius);
    if (piece.from) {
      return 'M ' + fmt(c) + ' L ' + fmt(piece.from) + ' A ' + r + ' ' + r +
        ' 0 0 1 ' + fmt(piece.to) + ' Z';
    }
    // two half circles; sweep flag 1 winds them as the polygons are wound
    return 'M ' + fmt([c[0] + r, c[1]]) + ' A ' + r + ' ' + r + ' 0 1 1 ' +
      fmt([c[0] - r, c[1]]) + ' A ' + r + ' ' + r + ' 0 1 1 ' +
      fmt([c[0] + r, c[1]]) + ' Z';
  }).join(' ');
}

// The pieces that reach into @bbox ([xmin, ymin, xmax, ymax]), with polygons
// that cross its edge cut to it. For the canvas, which stops drawing a shape
// whose coordinates grow too large: zoomed far in, a line's outline runs far
// outside the view, though it is built from the whole line, whose ends set
// its widths. Clipping keeps the winding of the polygons, and the cut edges
// lie outside the view when @bbox is the view with a margin.
export function clipTaperedPieces(pieces, bbox) {
  var out = [];
  pieces.forEach(function(piece) {
    var b, points;
    if (piece.center) {
      b = [piece.center[0] - piece.radius, piece.center[1] - piece.radius,
        piece.center[0] + piece.radius, piece.center[1] + piece.radius];
      if (boxesIntersect(b, bbox)) out.push(piece);
      return;
    }
    b = getPointsBox(piece.points);
    if (!boxesIntersect(b, bbox)) return;
    if (b[0] >= bbox[0] && b[1] >= bbox[1] && b[2] <= bbox[2] && b[3] <= bbox[3]) {
      out.push(piece);
      return;
    }
    points = clipPolygonToBox(piece.points, bbox);
    if (points.length > 2) out.push({points: points});
  });
  return out;
}

// Sutherland-Hodgman, which is exact for a convex polygon such as a piece
function clipPolygonToBox(points, bbox) {
  var out = points;
  [[0, 1, bbox[0]], [1, 1, bbox[1]], [0, -1, bbox[2]], [1, -1, bbox[3]]].forEach(function(edge) {
    out = clipPolygonToEdge(out, edge[0], edge[1], edge[2]);
  });
  return out;
}

// Keeps the side of the line where p[@dim] * @sign >= @val * @sign
function clipPolygonToEdge(points, dim, sign, val) {
  var out = [];
  var a, b, ina, inb, k, i;
  for (i = 0; i < points.length; i++) {
    a = points[i];
    b = points[(i + 1) % points.length];
    ina = (a[dim] - val) * sign >= 0;
    inb = (b[dim] - val) * sign >= 0;
    if (ina) out.push(a);
    if (ina != inb) {
      k = (val - a[dim]) / (b[dim] - a[dim]);
      out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
    }
  }
  return out;
}

function getPointsBox(points) {
  var b = [Infinity, Infinity, -Infinity, -Infinity];
  points.forEach(function(p) {
    if (p[0] < b[0]) b[0] = p[0];
    if (p[1] < b[1]) b[1] = p[1];
    if (p[0] > b[2]) b[2] = p[0];
    if (p[1] > b[3]) b[3] = p[1];
  });
  return b;
}

function boxesIntersect(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function addSegment(pieces, a, b, ra, rb) {
  var n = getNormal(a, b);
  addPolygon(pieces, [
    [a[0] + n[0] * ra, a[1] + n[1] * ra],
    [b[0] + n[0] * rb, b[1] + n[1] * rb],
    [b[0] - n[0] * rb, b[1] - n[1] * rb],
    [a[0] - n[0] * ra, a[1] - n[1] * ra]
  ]);
}

// Fills the gap the two segments' pieces leave on the outside of the bend at
// @b: the wedge between the ends of their edges, and no more. It lies behind
// the end of each segment's piece at @b, so it can't reach past the end of a
// dash that stops just after the bend, as a whole round join would.
function addJoin(pieces, a, b, c, r) {
  var n1 = getNormal(a, b);
  var n2 = getNormal(b, c);
  var cos = n1[0] * n2[0] + n1[1] * n2[1];
  var side, p1, p2, mid, len;
  if (!(r > 0) || cos >= 1) return;
  // the gap is on the side the line turns away from
  side = (c[0] - b[0]) * n1[0] + (c[1] - b[1]) * n1[1] > 0 ? -1 : 1;
  p1 = [b[0] + side * n1[0] * r, b[1] + side * n1[1] * r];
  p2 = [b[0] + side * n2[0] * r, b[1] + side * n2[1] * r];
  if (Math.acos(Math.max(cos, -1)) <= ROUND_JOIN_ANGLE) {
    addPolygon(pieces, [b, p1, p2]);
    return;
  }
  // a round join, as two sectors meeting halfway round it, so that each is
  // less than a half circle -- which it is not, for a line that turns back
  // on itself
  mid = [side * (n1[0] + n2[0]), side * (n1[1] + n2[1])];
  len = Math.sqrt(mid[0] * mid[0] + mid[1] * mid[1]);
  if (len > 1e-9) {
    mid = [mid[0] / len, mid[1] / len];
  } else {
    // straight back: halfway round is straight on
    mid = [n1[1], -n1[0]];
  }
  mid = [b[0] + mid[0] * r, b[1] + mid[1] * r];
  addSector(pieces, b, r, p1, mid);
  addSector(pieces, b, r, mid, p2);
}

// A sector of the circle at @center through @from and @to, the short way
// round, wound like the polygons
function addSector(pieces, center, r, from, to) {
  var cross = (from[0] - center[0]) * (to[1] - center[1]) -
    (from[1] - center[1]) * (to[0] - center[0]);
  pieces.push(cross >= 0 ? {center: center, radius: r, from: from, to: to} :
    {center: center, radius: r, from: to, to: from});
}

function addPolygon(pieces, points) {
  if (getSignedArea(points) < 0) points.reverse();
  pieces.push({points: points});
}

// Twice the area, positive for a ring that is clockwise on screen (y down)
function getSignedArea(points) {
  var sum = 0, a, b, i;
  for (i = 0; i < points.length; i++) {
    a = points[i];
    b = points[(i + 1) % points.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum;
}

// Unit vector at right angles to the segment from @a to @b
function getNormal(a, b) {
  var d = dist(a, b);
  return [-(b[1] - a[1]) / d, (b[0] - a[0]) / d];
}

function removeDuplicatePoints(coords) {
  var pts = [];
  (coords || []).forEach(function(p) {
    var prev = pts[pts.length - 1];
    if (!prev || prev[0] != p[0] || prev[1] != p[1]) pts.push(p);
  });
  return pts;
}

function dist(a, b) {
  var dx = b[0] - a[0], dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function fmt(p) {
  return round(p[0]) + ' ' + round(p[1]);
}

function round(n) {
  return Math.round(n * 100) / 100;
}
