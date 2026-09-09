import Flatbush from 'flatbush';
import { mergeArcs } from '../dataset/mapshaper-merging';
import { metersToDegrees } from '../geom/mapshaper-basic-geom';
import geom from '../geom/mapshaper-geom';
import { ArcCollection } from '../paths/mapshaper-arcs';
import {
  GAP_WIDTH_SEGMENT_FRACTION,
  applyDefaultGapWidthOpts,
  getMedianPolygonSegmentLength,
  getSliverFilter
} from '../polygons/mapshaper-slivers';
import { MosaicIndex } from '../polygons/mapshaper-mosaic-index';
import { message, verbose } from '../utils/mapshaper-logging';
import {
  markDatasetChanged,
  noteDatasetWillChange
} from '../undo/mapshaper-undo-tracking';
import utils from '../utils/mapshaper-utils';

var MIN_GAP_OWNERS = 3;
var WIDTH_FACTOR = 4;


// Split enclosed sliver gaps that border three or more features along the lines
// midway between their neighbors' boundaries. The existing mosaic assignment can
// then distribute the resulting pieces among those features instead of handing
// the entire long gap to one owner.
//
// Only the boundaries of the gaps being repaired are examined, so the cost
// scales with those gaps rather than with the full mosaic.
// Returns a layer of cut lines added to the dataset.
export function partitionPolygonMosaicGaps(lyr, dataset, nodes, opts) {
  if (!lyr.shapes || lyr.shapes.length < MIN_GAP_OWNERS) return false;
  var mosaicIndex = new MosaicIndex(lyr, nodes, {flat: true});
  var sliverOpts = applyDefaultGapWidthOpts(opts);
  var filter = getSliverFilter(lyr, dataset, sliverOpts).filter;
  var gaps = mosaicIndex.getUnusedTileData(filter).filter(function(gap) {
    return countOwners(gap.boundary) >= MIN_GAP_OWNERS;
  });
  if (gaps.length === 0) return false;

  var minWidth = getMinDivisibleGapWidth(lyr, nodes.arcs);
  var cuts = [];
  var partitioned = 0;
  gaps.forEach(function(gap) {
    var result = buildGapPartitionCuts(gap, nodes.arcs, minWidth);
    if (!result) return;
    var before = cuts.length;
    result.lines.forEach(function(line) {
      if (line.length < 2) return;
      cuts.push(line);
    });
    if (cuts.length > before) partitioned++;
  });
  if (cuts.length === 0) return false;

  // Both mutations below have to be announced before either happens: undo
  // captures the dataset's arc collection and layer list together, and it needs
  // the originals -- the collection this replaces, and a layer list without the
  // temporary layer added here. Restoring the arc coordinates alone would leave
  // the dataset pointing at the merged collection, with layer shapes referring to
  // arc ids from the original one.
  noteDatasetWillChange(dataset, {operation: 'partitionGaps', unit: 'arcs'});
  var firstCutArc = dataset.arcs.size();
  dataset.arcs = mergeArcs([dataset.arcs, new ArcCollection(cuts)]);
  // Keep cut arcs in a temporary line layer while addIntersectionCuts() nodes
  // them against the gap boundary. The caller removes this layer before polygon
  // cleaning and passes its updated arc ids to the mosaic node filter.
  var cutLayer = {
    geometry_type: 'polyline',
    shapes: cuts.map(function(line, i) {
      return [[firstCutArc + i]];
    })
  };
  dataset.layers.push(cutLayer);
  markDatasetChanged(dataset, {operation: 'partitionGaps', unit: 'arcs'});
  verbose(utils.format('Partitioned %s multi-feature interior gap%s',
    partitioned, utils.pluralSuffix(partitioned)));
  return cutLayer;
}

function countOwners(boundary) {
  var owners = {};
  boundary.forEach(function(o) { owners[o.shapeId] = true; });
  return Object.keys(owners).length;
}

// Divide a gap along the centerlines between the boundary runs that face each
// other across it.
//
// The gap's boundary is a cyclic sequence of arcs, each owned by one adjacent
// feature, so it decomposes into one run per owner. The dividing line between
// two runs is the locus of points equidistant from both; taking the midpoint
// between each run's vertices and its footpoint on the other run gives a line
// that bends wherever either bank bends, and between two consecutive bends both
// banks are straight, where the exact bisector is straight as well.
//
// Cost and output size track the boundary's own vertex count, so a gap that is
// long and hairline costs no more than a compact one. (A sampled Voronoi medial
// axis cannot make that promise: its circumcenters are only meaningful when the
// sample spacing is finer than the channel is wide, so the work it takes grows
// with the gap's length-to-width ratio.)
export function buildGapPartitionCuts(gap, arcs, minWidth) {
  var runs = getOwnerRuns(gap.boundary);
  if (runs.length < MIN_GAP_OWNERS) return null;
  var ring = gap.tile[0];
  // Both measures must be planar even when the source CRS is geographic: the
  // cuts are built in source-coordinate space.
  var area = Math.abs(geom.getPlanarPathArea(ring, arcs));
  var perimeter = geom.getPlanarPathPerimeter(ring, arcs);
  if (!(area > 0) || !(perimeter > 0)) return null;
  // For a long narrow polygon, 2A/P approximates its width.
  var gapWidth = area / perimeter * 2;
  if (gapWidth < minWidth) return null;
  // A modest multiplier gives facing banks enough reach where the gap is locally
  // wider, e.g. at a junction.
  var width = gapWidth * WIDTH_FACTOR;
  var ringPoints = getPathPoints(ring, arcs);
  var ringIndex = new SegmentIndex(ringPoints);
  var banks = runs.map(function(run) {
    return makeBank(getRunPoints(run.arcIds, arcs));
  });
  var lines = [];
  for (var i = 0; i < banks.length; i++) {
    for (var j = i + 1; j < banks.length; j++) {
      var line = buildCenterlineBetweenBanks(banks[i], banks[j], width, ringIndex,
        collectEndAnchors(banks, i, j, width));
      if (line.length >= 2) lines.push(line);
    }
  }
  if (lines.length === 0) return null;
  return {lines: anchorCutLines(lines, width, ringPoints)};
}

function makeBank(points) {
  return {
    points: points,
    index: points.length > 1 ? new SegmentIndex(points) : null
  };
}

// Make a set of centerlines divide the gap: every line has to reach the gap's
// boundary at each end, either directly or through a shared junction with other
// lines, or the mosaic treats it as a dangling arc and ignores it.
//
// A line ending on a vertex of the boundary is already joined to it, that vertex
// being a node of the mosaic. Anywhere else, including a point part way along a
// boundary segment, the line has to be projected past the boundary to cross it:
// starting an extension on the boundary rather than crossing it creates no node
// at all, and the cut is ignored.
function anchorCutLines(lines, width, ringPoints) {
  var ringVertices = new Set(ringPoints.map(function(p) {
    return p[0] + '|' + p[1];
  }));
  var ends = [];
  lines.forEach(function(line, lineId) {
    [line[0], line[line.length - 1]].forEach(function(point, side) {
      ends.push({
        lineId: lineId,
        side: side,
        point: point,
        onBoundary: ringVertices.has(point[0] + '|' + point[1])
      });
    });
  });
  var connectors = [];
  var joined = new Uint8Array(ends.length);
  clusterCutEnds(ends, width * 3).forEach(function(cluster) {
    var hub = [0, 0];
    cluster.forEach(function(i) {
      hub[0] += ends[i].point[0];
      hub[1] += ends[i].point[1];
    });
    hub[0] /= cluster.length;
    hub[1] /= cluster.length;
    cluster.forEach(function(i) {
      joined[i] = 1;
      connectors.push([ends[i].point, hub]);
    });
  });
  var anchored = lines.map(function(line, lineId) {
    var out = line.concat();
    ends.forEach(function(end, i) {
      if (end.lineId !== lineId || joined[i] || end.onBoundary) return;
      var inward = end.side ? out[out.length - 2] : out[1];
      var beyond = projectPast(end.point, inward, width);
      if (!beyond) return;
      if (end.side) out.push(beyond);
      else out.unshift(beyond);
    });
    return out;
  });
  return anchored.concat(connectors);
}

// Group line ends that meet in the interior of the gap, where three or more
// centerlines converge on the point equidistant from three boundary runs. Ends
// already on the boundary are not candidates, and neither is a pair of ends
// from the same line.
function clusterCutEnds(ends, maxDist) {
  var used = new Uint8Array(ends.length);
  var clusters = [];
  ends.forEach(function(end, i) {
    if (used[i] || end.onBoundary) return;
    var cluster = [];
    var stack = [i];
    used[i] = 1;
    while (stack.length) {
      var id = stack.pop();
      cluster.push(id);
      ends.forEach(function(other, j) {
        if (used[j] || other.onBoundary || other.lineId === ends[id].lineId) return;
        if (geom.distance2D(ends[id].point[0], ends[id].point[1],
          other.point[0], other.point[1]) <= maxDist) {
          used[j] = 1;
          stack.push(j);
        }
      });
    }
    var lineIds = {};
    cluster.forEach(function(id) { lineIds[ends[id].lineId] = true; });
    if (Object.keys(lineIds).length >= MIN_GAP_OWNERS) clusters.push(cluster);
  });
  return clusters;
}

// One run per owner, in ring order. The ring is cyclic, so a run split across
// the array ends is rejoined.
export function getOwnerRuns(boundary) {
  var runs = [];
  boundary.forEach(function(o) {
    var last = runs[runs.length - 1];
    if (last && last.shapeId === o.shapeId) {
      last.arcIds.push(o.arcId);
    } else {
      runs.push({shapeId: o.shapeId, arcIds: [o.arcId]});
    }
  });
  if (runs.length > 2 && runs[0].shapeId === runs[runs.length - 1].shapeId) {
    runs[0].arcIds = runs.pop().arcIds.concat(runs[0].arcIds);
  }
  return runs;
}

function getPathPoints(ids, arcs) {
  var points = [];
  var iter = arcs.getShapeIter(ids);
  while (iter.hasNext()) {
    points.push([iter.x, iter.y]);
  }
  return points;
}

function getRunPoints(arcIds, arcs) {
  var points = [];
  arcIds.forEach(function(arcId) {
    var iter = arcs.getArcIter(arcId);
    while (iter.hasNext()) {
      var last = points[points.length - 1];
      // consecutive arcs share their joining vertex
      if (!last || last[0] !== iter.x || last[1] !== iter.y) {
        points.push([iter.x, iter.y]);
      }
    }
  });
  return points;
}

function buildCenterlineBetweenBanks(bankA, bankB, maxDist, ringIndex, anchors) {
  var events = [];
  // Each vertex contributes a midpoint, positioned along bank A so that
  // contributions from both banks interleave in one order.
  bankA.points.forEach(function(p, i) {
    var mid = crossGapMidpoint(p, bankB, maxDist, ringIndex);
    if (mid) events.push({pos: i, point: mid.point});
  });
  bankB.points.forEach(function(p, i) {
    var mid = crossGapMidpoint(p, bankA, maxDist, ringIndex);
    if (mid) events.push({pos: mid.pos, point: mid.point});
  });
  anchors.forEach(function(event) { events.push(event); });
  events.sort(function(a, b) { return a.pos - b.pos; });
  var points = [];
  events.forEach(function(o) {
    var last = points[points.length - 1];
    if (!last || last[0] !== o.point[0] || last[1] !== o.point[1]) {
      points.push(o.point);
    }
  });
  return points;
}

// Where the centerline between two boundary runs meets the ends of the gap.
// Ordered outside bank A's own vertex positions, so they bracket the midpoints
// between the two banks.
//
// Midpoints alone do not reach the ends: approaching one, a vertex's nearest point
// on the facing bank swings round towards the end itself, and the midpoints stop
// describing the middle of the gap. Taking the ends from the boundary is both
// exact and what makes the cut divide the gap, since a cut has to reach the
// boundary to have any effect.
function collectEndAnchors(banks, i, j, maxDist) {
  var points = banks[i].points;
  var out = [];
  // walking the boundary each way round from bank A: A's last vertex leads
  // forwards, its first vertex backwards
  [[j, points.length], [i, -1]].forEach(function(o) {
    var between = runsBetween(banks, o[0] === j ? i : j, o[0]);
    var point = null;
    if (between.length === 0) {
      // The two runs meet, pinching the gap shut, and their shared node is
      // equidistant from both.
      point = o[1] < 0 ? points[0] : points[points.length - 1];
    } else if (between.length === 1 && pathLength(between[0].points) <= maxDist) {
      // A single run short enough to be a cap rather than a third bank: the gap
      // ends across it, midway along.
      point = midpointOfPath(between[0].points);
    }
    if (point) out.push({pos: o[1], point: point});
  });
  return out;
}

// The runs lying between two others, walking the boundary forwards.
function runsBetween(banks, from, to) {
  var out = [];
  for (var k = (from + 1) % banks.length; k !== to; k = (k + 1) % banks.length) {
    out.push(banks[k]);
  }
  return out;
}

function pathLength(points) {
  var len = 0;
  for (var i = 1; i < points.length; i++) {
    len += geom.distance2D(points[i - 1][0], points[i - 1][1],
      points[i][0], points[i][1]);
  }
  return len;
}

function midpointOfPath(points) {
  var half = pathLength(points) / 2;
  var walked = 0;
  for (var i = 1; i < points.length; i++) {
    var seg = geom.distance2D(points[i - 1][0], points[i - 1][1],
      points[i][0], points[i][1]);
    if (walked + seg >= half) {
      var t = seg > 0 ? (half - walked) / seg : 0;
      return [
        points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t
      ];
    }
    walked += seg;
  }
  return points[points.length - 1];
}

// The midpoint between a vertex of one boundary run and its footpoint on
// another, where the two runs face each other across the gap.
//
// Two runs can instead meet at a node and carry on along the same side of the
// gap. Those produce midpoints too, but ones lying on the boundary rather than
// between two banks, and a cut along them shaves a hairline strip off one feature
// to award it to another -- the very artifact partitioning exists to avoid. So a
// midpoint counts only if it lies inside the gap, clear of the boundary by an
// amount comparable to the separation it came from.
function crossGapMidpoint(point, otherBank, maxDist, ringIndex) {
  if (!otherBank.index) return null;
  var foot = otherBank.index.closestPoint(point[0], point[1], maxDist);
  if (!foot || !(foot.distSq > 0)) return null;
  var mid = [(point[0] + foot.x) / 2, (point[1] + foot.y) / 2];
  // Half the separation is what a midpoint between facing banks has. A quarter
  // allows for a gap that narrows, bringing a third stretch of its boundary
  // closer to the midpoint than the banks it came from.
  if (ringIndex.hasSegmentWithin(mid[0], mid[1], Math.sqrt(foot.distSq) / 4)) {
    return null;
  }
  // Two runs can also face each other across a feature, in a gap that bends back
  // on itself.
  if (!ringIndex.containsPoint(mid[0], mid[1])) return null;
  return {point: mid, pos: foot.pos};
}

// The vertex tests above run once per boundary vertex, and the boundary of a long
// gap in detailed data carries thousands of them, so each test has to examine a
// bounded number of segments rather than the whole path. @points is an open
// polyline, or a closed ring for containsPoint().
function SegmentIndex(points) {
  var n = points.length - 1;
  var index = new Flatbush(n);
  var xmax = -Infinity;
  for (var i = 0; i < n; i++) {
    var ax = points[i][0], ay = points[i][1];
    var bx = points[i + 1][0], by = points[i + 1][1];
    index.add(Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by));
    if (ax > xmax) xmax = ax;
    if (bx > xmax) xmax = bx;
  }
  index.finish();

  // Nearest point on the path within @maxDist, with its position along the path
  // (segment index plus the fraction into that segment) so that midpoints from
  // either bank can be ordered on a common parameter. A segment within @maxDist
  // of the point has its nearest point inside the query box, so its own bounding
  // box meets that box: nothing near enough is missed.
  this.closestPoint = function(x, y, maxDist) {
    var ids = index.search(x - maxDist, y - maxDist, x + maxDist, y + maxDist);
    var maxSq = maxDist * maxDist;
    var best = null;
    for (var k = 0; k < ids.length; k++) {
      var i = ids[k];
      var ax = points[i][0], ay = points[i][1];
      var dx = points[i + 1][0] - ax, dy = points[i + 1][1] - ay;
      var len2 = dx * dx + dy * dy;
      var t = len2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / len2 : 0;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      var fx = ax + t * dx, fy = ay + t * dy;
      var distSq = (x - fx) * (x - fx) + (y - fy) * (y - fy);
      if (distSq <= maxSq && (!best || distSq < best.distSq)) {
        best = {x: fx, y: fy, distSq: distSq, pos: i + t};
      }
    }
    return best;
  };

  this.hasSegmentWithin = function(x, y, dist) {
    var ids = index.search(x - dist, y - dist, x + dist, y + dist);
    var distSq = dist * dist;
    for (var k = 0; k < ids.length; k++) {
      var i = ids[k];
      if (geom.pointSegDistSq2(x, y, points[i][0], points[i][1],
          points[i + 1][0], points[i + 1][1]) < distSq) {
        return true;
      }
    }
    return false;
  };

  // Crossings of the ray running right from the point: odd means inside. A point
  // on the ring counts as inside, as the linear test this replaces had it.
  this.containsPoint = function(x, y) {
    var ids = index.search(x, y, xmax, y);
    var inside = false;
    for (var k = 0; k < ids.length; k++) {
      var i = ids[k];
      var ay = points[i][1], by = points[i + 1][1];
      if (ay > y === by > y) continue;
      var ax = points[i][0], bx = points[i + 1][0];
      if (ax + (y - ay) / (by - ay) * (bx - ax) > x) inside = !inside;
    }
    return inside;
  };
}

// The narrowest gap worth dividing, in coordinate units: the automatic
// gap-width, one hundredth of the median distance between vertices.
//
// Dividing a gap is only an improvement while the gap has a width worth
// dividing. Awarding a whole gap to one feature moves that feature's boundary
// across to the far bank, by the width of the gap; dividing it instead gives
// every neighbor a strip of its own, and the boundary between two strips runs
// half the gap's width from the bank it was cut from, out and back. Wide gap:
// the first is a visible displacement and the second is a fair division. Gap a
// few millimeters wide: the first is imperceptible, and the second decorates
// several features with hairline slivers, which is worse for having more of them.
//
// A layer's median segment length is the scale at which its boundaries were
// drawn. A small fraction of that scale marks where dividing a gap stops being
// worth it: the displacement would be smaller than the data's own detail, and
// the pieces would be hairline slivers. This is deliberately independent of
// the gap-width in effect: raising that to fill wider gaps should not coarsen
// the data's own scale.
export function getMinDivisibleGapWidth(lyr, arcs) {
  var width = getMedianPolygonSegmentLength(lyr, arcs) *
    GAP_WIDTH_SEGMENT_FRACTION;
  // That median comes back in meters for geographic coordinates, whereas cuts
  // are built in the source coordinate space. Converting it back with the same
  // test it was measured under keeps the two in step.
  return arcs.isPlanar() ? width : metersToDegrees(width);
}

function projectPast(from, toward, distance) {
  var dx = from[0] - toward[0];
  var dy = from[1] - toward[1];
  var len = Math.sqrt(dx * dx + dy * dy);
  if (!(len > 0)) return null;
  return [
    from[0] + dx / len * distance,
    from[1] + dy / len * distance
  ];
}