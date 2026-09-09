import Flatbush from 'flatbush';
import { getDatasetCRS, isLatLngCRS } from '../crs/mapshaper-projections';
import { fastLonLatDistance, distance2D, degreesToMeters, R2D, R } from '../geom/mapshaper-basic-geom';
import { convertDistanceParam } from '../geom/mapshaper-units';
import {
  GAP_WIDTH_SEGMENT_FRACTION,
  getDefaultGapWidth,
  getMedianPolygonSegmentLength
} from '../polygons/mapshaper-slivers';
import { getOutsideFacingArcFlags } from '../polygons/mapshaper-mosaic-index';
import { getHighPrecisionSnapInterval } from '../paths/mapshaper-snapping';
import { traversePaths } from '../paths/mapshaper-path-utils';
import { buildTopology } from '../topology/mapshaper-topology';
import { message, verbose } from '../utils/mapshaper-logging';
import { profileStart, profileEnd, profileWrap } from '../utils/mapshaper-profile';
import utils from '../utils/mapshaper-utils';

// Two boundaries that should be one, but were digitized or computed twice, drift
// apart by more than the single interval that ordinary vertex snapping repairs,
// and their vertices are staggered, so no pairwise snapping ever sees them. In
// the test corpus the worst of them sit ~20 intervals apart. This multiple keeps
// the default repair at sub-micron scale, far below any gap a map could show,
// while still catching them.
var PRECISION_SEAM_INTERVALS = 100;

// Minimum accepted seam length, as a multiple of the median segment length. Two
// boundaries that merely pass close to each other for a vertex or two are not a
// seam.
var MIN_SEAM_SEGMENT_FACTOR = 3;

// Collapse duplicate boundaries: two arcs carrying what should be one line,
// digitized or computed twice and drifting apart by no more than floating-point
// rounding (see PRECISION_SEAM_INTERVALS). Vertices on both banks are snapped to
// the line midway between them, leaving a single shared boundary.
//
// Runs unconditionally. Left in place, such a seam becomes an enclosed sliver
// that gap filling awards to one neighbor, giving that feature a zero-width spike
// along the shared border.
//
// Returns the number of duplicate boundaries collapsed (see countConnectedGaps).
export function collapseDuplicateBoundaries(layers, dataset) {
  var polygonLayers = layers.filter(function(lyr) {
    return lyr.geometry_type == 'polygon' && lyr.shapes && lyr.shapes.length > 1;
  });
  if (polygonLayers.length === 0 || !dataset.arcs) return 0;

  var spherical = isLatLngCRS(getDatasetCRS(dataset));
  var changed = 0;
  polygonLayers.forEach(function(lyr) {
    changed += collapseLayerDuplicates(lyr, dataset.arcs, spherical);
  });
  if (changed > 0) {
    rebuildTopology(dataset);
    verbose(utils.format('Closed %s duplicate boundar%s', changed,
      changed == 1 ? 'y' : 'ies'));
  }
  return changed;
}

function collapseLayerDuplicates(lyr, arcs, spherical) {
  var medianSeg = measureMedianSegment(lyr, arcs);
  var distance = getPrecisionSeamDistance(arcs.getBounds().toArray(), spherical);
  if (!(distance > 0)) return 0;

  // Keep the automatic search radius when the closing distance is smaller. This
  // lets us see the complete seam and reject it as a unit instead of partially
  // snapping the already-near portion while leaving its wider mouth open. A
  // duplicate boundary often has a mouth several orders of magnitude wider than
  // the seam behind it.
  var searchDistance = Math.max(distance, medianSeg * GAP_WIDTH_SEGMENT_FRACTION);
  var found = findLayerSeams(lyr, arcs, distance, searchDistance, spherical,
    medianSeg * MIN_SEAM_SEGMENT_FACTOR, null);
  if (!found) return 0;
  var snapped = profileWrap('cg.snapSeams', function() {
    return snapSeams(found.seams, found.seeds, found.arcsById, arcs,
      found.footpoints, distance);
  });
  return countConnectedGaps(snapped);
}

// A crack that opens onto the space outside the mosaic is not enclosed by
// polygons, so no tile covers it and gap filling cannot reach it. Snapping the
// facing pair of vertices at each open end together encloses the crack, handing
// it to the mosaic as an ordinary gap to be filled -- or divided between its
// neighbors, where it borders three or more of them -- like any other.
//
// Only those pairs move: two coordinates per mouth, each by half the width of the
// mouth. Interior gaps are left exactly as they were found, so they are filled the
// same way whether or not this pass runs.
//
// Returns the number of mouths pinched shut.
export function pinchOuterCrackMouths(lyr, dataset, nodes, opts) {
  var arcs = dataset.arcs;
  if (!lyr.shapes || lyr.shapes.length < 2 || !arcs) return 0;
  var crs = getDatasetCRS(dataset);
  var spherical = isLatLngCRS(crs);
  var medianSeg = measureMedianSegment(lyr, arcs);
  // Same width as interior gap filling, from the same automatic default.
  var distance = resolveCloseDistance(opts, crs, getDefaultGapWidth(lyr, arcs));
  if (!(distance > 0)) return 0;

  profileStart('cg.outsideFacingArcs');
  var outsideFacing = getOutsideFacingArcFlags(nodes);
  profileEnd('cg.outsideFacingArcs');
  var found = findLayerSeams(lyr, arcs, distance, distance, spherical,
    medianSeg * MIN_SEAM_SEGMENT_FACTOR, function(arcId) {
      return outsideFacing[arcId] === 1;
    });
  if (!found) return 0;

  var pinched = profileWrap('cg.pinchMouths', function() {
    return pinchSeamMouths(found.seams, found.arcsById, arcs, nodes,
      found.footpoints, distance, spherical);
  });
  if (pinched > 0) {
    rebuildTopology(dataset);
    message(utils.format('Closed %s external gap%s', pinched,
      utils.pluralSuffix(pinched)));
  }
  return pinched;
}

// Seams between facing arcs owned by different features: stretches where two
// boundaries run within @distance of each other for at least @minSeamLength.
// @keepArc, when given, limits which arcs are considered.
function findLayerSeams(lyr, arcs, distance, searchDistance, spherical,
    minSeamLength, keepArc) {
  profileStart('cg.collectVertices');
  var owners = getArcOwners(lyr.shapes, arcs.size());
  var records = collectExternalVertices(arcs, owners, keepArc);
  profileEnd('cg.collectVertices');
  if (records.length < 4) return null;

  profileStart('cg.findMouthSeeds');
  var seeds = findMouthSeeds(records, searchDistance, spherical);
  profileEnd('cg.findMouthSeeds');
  if (seeds.length === 0) return null;

  var arcsById = indexArcRecords(records);
  var footpoints = new ArcFootpoints(arcs, spherical);
  profileStart('cg.growSeams');
  var seams = growSeamsFromSeeds(seeds, arcsById, footpoints, distance, spherical,
    minSeamLength);
  profileEnd('cg.growSeams');
  if (seams.length === 0) return null;
  return {seams: seams, seeds: seeds, arcsById: arcsById, footpoints: footpoints};
}

// Median of every polygon-ring segment; used for min-seam length.
function measureMedianSegment(lyr, arcs) {
  return profileWrap('cg.medianSegment', function() {
    return getMedianPolygonSegmentLength(lyr, arcs);
  });
}

function rebuildTopology(dataset) {
  profileStart('cg.rebuildTopology');
  dataset.arcs.dedupCoords();
  buildTopology(dataset);
  profileEnd('cg.rebuildTopology');
}

// One crack presents many seams: a seam is a stretch of two facing arcs, and
// every node along either side ends one arc and starts another -- where a third
// feature meets the boundary, or where an intersection cut fell. Reporting seams
// would give a number several times the number of cracks there are to see, so
// seams meeting along a shared arc count once.
//
// Two cracks that face the same arc at different stretches of it are counted as
// one. Erring towards the smaller number suits a count of gaps closed better than
// splitting one crack into the arcs it happens to be divided into.
function countConnectedGaps(seams) {
  var parents = new Map();

  function find(id) {
    var parent = parents.get(id);
    if (parent === undefined) {
      parents.set(id, id);
      return id;
    }
    while (parent !== id) {
      id = parent;
      parent = parents.get(id);
    }
    return id;
  }

  seams.forEach(function(seam) {
    var a = find(seam.arcA);
    var b = find(seam.arcB);
    if (a !== b) parents.set(a, b);
  });
  var roots = new Set();
  seams.forEach(function(seam) { roots.add(find(seam.arcA)); });
  return roots.size;
}

// Closing distance for the default pass, which collapses duplicate boundaries
// and nothing else. @bounds is the arc bounding box in coordinate units; the seam
// walk measures distances in meters when those units are degrees.
export function getPrecisionSeamDistance(bounds, spherical) {
  var interval = getHighPrecisionSnapInterval(bounds) * PRECISION_SEAM_INTERVALS;
  return spherical ? degreesToMeters(interval) : interval;
}

function resolveCloseDistance(opts, crs, autoDistance) {
  var arg = opts.gap_width;
  if (arg == null || arg === 'auto') return autoDistance;
  if (+arg === 0) return 0;
  return convertDistanceParam(arg, crs);
}

// An external arc belongs to exactly one feature. Shared arcs are excluded: they
// already represent clean topology and must not be moved by this repair.
function getArcOwners(shapes, arcCount) {
  var first = new Int32Array(arcCount);
  var second = new Int32Array(arcCount);
  for (var i = 0; i < arcCount; i++) {
    first[i] = -1;
    second[i] = -1;
  }
  traversePaths(shapes, function(o) {
    var id = o.arcId < 0 ? ~o.arcId : o.arcId;
    var owner = o.shapeId;
    if (first[id] == -1) first[id] = owner;
    else if (first[id] != owner) second[id] = owner;
  });
  return {first: first, second: second};
}

function collectExternalVertices(arcs, owners, keepArc) {
  var data = arcs.getVertexData();
  var records = [];
  var offs = 0;
  for (var arcId = 0; arcId < data.nn.length; arcId++) {
    var n = data.nn[arcId];
    if (owners.first[arcId] >= 0 && owners.second[arcId] == -1 &&
        (!keepArc || keepArc(arcId))) {
      for (var k = 0; k < n; k++) {
        var i = offs + k;
        records.push({
          x: data.xx[i],
          y: data.yy[i],
          i: i,
          arc: arcId,
          k: k,
          owner: owners.first[arcId]
        });
      }
    }
    offs += n;
  }
  return records;
}

function indexArcRecords(records) {
  var byArc = {};
  records.forEach(function(o) {
    if (!byArc[o.arc]) byArc[o.arc] = [];
    byArc[o.arc].push(o);
  });
  Object.keys(byArc).forEach(function(id) {
    byArc[id].sort(function(a, b) { return a.k - b.k; });
  });
  return byArc;
}

// Mouth seeds: mutual nearest external vertices on different owners/arcs.
// A single positive-distance pair is enough to start an edge walk.
function findMouthSeeds(records, distance, spherical) {
  var index = new Flatbush(records.length);
  records.forEach(function(o) { index.add(o.x, o.y, o.x, o.y); });
  index.finish();

  var nearest = new Int32Array(records.length);
  var distances = new Float64Array(records.length);
  nearest.fill(-1);
  records.forEach(function(a, ai) {
    var padY = getCoordinatePad(distance, a.y, spherical, false);
    var padX = getCoordinatePad(distance, a.y, spherical, true);
    var ids = index.search(a.x - padX, a.y - padY, a.x + padX, a.y + padY);
    var best = -1, bestDist = Infinity;
    ids.forEach(function(bi) {
      var b = records[bi];
      if (bi == ai || b.owner == a.owner || b.arc == a.arc) return;
      var d = spherical ?
        fastLonLatDistance(a.x, a.y, b.x, b.y) :
        distance2D(a.x, a.y, b.x, b.y);
      if (d <= distance && d < bestDist) {
        best = bi;
        bestDist = d;
      }
    });
    nearest[ai] = best;
    distances[ai] = bestDist;
  });

  var seen = {};
  var seeds = [];
  records.forEach(function(a, ai) {
    var bi = nearest[ai];
    if (bi < 0 || !(distances[ai] > 0)) return;
    var best = records[bi];
    // Positive-distance matches must be mutual nearest neighbors.
    if (nearest[bi] != ai) return;
    var lo = Math.min(a.i, best.i), hi = Math.max(a.i, best.i);
    var key = lo + ':' + hi;
    if (seen[key]) return;
    seen[key] = true;
    seeds.push({a: a, b: best, distance: distances[ai]});
  });
  return seeds;
}

function getCoordinatePad(distance, lat, spherical, longitude) {
  if (spherical) {
    var deg = distance / R * R2D;
    return longitude ? deg / Math.max(Math.cos(lat / R2D), 0.01) : deg;
  }
  // convertDistanceParam() has already converted physical units into projected
  // coordinate units (or left unitless values unchanged).
  return distance;
}

// Grow a seam from each mouth seed by walking both arcs while each vertex stays
// within closeDistance of the opposite arc's edges. Accept only seams whose
// walked length on both sides meets minSeamLength. Overlapping seeds that grow
// into the same arc-pair range are merged.
export function growSeamsFromSeeds(seeds, arcsById, footpoints, closeDistance,
    spherical, minSeamLength) {
  var seams = [];
  // Seeds crowd along a crack: every facing pair of vertices along it is one, and
  // each grows into the same stretch of the same two arcs, since what the walk
  // finds is the whole run of in-tolerance vertices around the seed rather than
  // anything particular to where it started. Walking that run once per seed
  // instead of once is what made this repair take minutes on a detailed mosaic,
  // so a seed already inside a run grown for its own two arcs is passed over.
  var grownByPair = new Map();
  seeds.forEach(function(seed) {
    var key = arcPairKey(seed.a.arc, seed.b.arc);
    var grown = grownByPair.get(key);
    if (!grown) {
      grown = [];
      grownByPair.set(key, grown);
    }
    if (seamContainsSeed(grown, seed)) return;
    var seam = growSeamFromSeed(seed, arcsById, footpoints, closeDistance,
      spherical);
    if (!seam) return;
    // Runs rejected as too short are recorded too, so that the seeds along them
    // are not walked again either.
    grown.push(seam);
    if (seam.lengthA < minSeamLength || seam.lengthB < minSeamLength) return;
    seams.push(seam);
  });
  return mergeOverlappingSeams(seams);
}

function arcPairKey(arcA, arcB) {
  return arcA < arcB ? arcA + '|' + arcB : arcB + '|' + arcA;
}

function indexSeamsByArcPair(seams) {
  var byPair = new Map();
  seams.forEach(function(seam) {
    var key = arcPairKey(seam.arcA, seam.arcB);
    var group = byPair.get(key);
    if (!group) {
      group = [];
      byPair.set(key, group);
    }
    group.push(seam);
  });
  return byPair;
}

function growSeamFromSeed(seed, arcsById, footpoints, closeDistance, spherical) {
  var sideA = arcsById[seed.a.arc];
  var sideB = arcsById[seed.b.arc];
  if (!sideA || !sideB) return null;

  var rangeA = expandRangeOnArc(sideA, seed.a.k, sideB, footpoints, closeDistance,
    spherical);
  var rangeB = expandRangeOnArc(sideB, seed.b.k, sideA, footpoints, closeDistance,
    spherical);
  if (!rangeA || !rangeB) return null;

  return {
    arcA: seed.a.arc,
    arcB: seed.b.arc,
    loA: rangeA.lo,
    hiA: rangeA.hi,
    loB: rangeB.lo,
    hiB: rangeB.hi,
    lengthA: rangeA.length,
    lengthB: rangeB.length
  };
}

// Expand along @side from seed index @seedK while each vertex remains within
// closeDistance of @other's edges. Returns the inclusive index range and the
// path length covered by the accepted stretch.
function expandRangeOnArc(side, seedK, other, footpoints, closeDistance, spherical) {
  if (seedK < 0 || seedK >= side.length) return null;
  if (!vertexWithinTolerance(side[seedK], other, footpoints, closeDistance)) {
    return null;
  }
  var lo = seedK;
  var hi = seedK;
  while (lo > 0 &&
      vertexWithinTolerance(side[lo - 1], other, footpoints, closeDistance)) {
    lo--;
  }
  while (hi + 1 < side.length &&
      vertexWithinTolerance(side[hi + 1], other, footpoints, closeDistance)) {
    hi++;
  }
  return {
    lo: lo,
    hi: hi,
    length: pathLengthBetween(side, lo, hi, spherical)
  };
}

function vertexWithinTolerance(vertex, otherSide, footpoints, closeDistance) {
  return !!footpoints.closestPoint(vertex.x, vertex.y, otherSide, closeDistance);
}

function pathLengthBetween(side, lo, hi, spherical) {
  var len = 0;
  for (var k = lo; k < hi; k++) {
    var a = side[k], b = side[k + 1];
    len += spherical ?
      fastLonLatDistance(a.x, a.y, b.x, b.y) :
      distance2D(a.x, a.y, b.x, b.y);
  }
  return len;
}

function mergeOverlappingSeams(seams) {
  if (seams.length <= 1) return seams;
  var out = [];
  // Only seams on the same two arcs can overlap, so each one is compared against
  // those alone rather than against every seam found so far.
  var byPair = new Map();
  seams.forEach(function(seam) {
    var a = Math.min(seam.arcA, seam.arcB);
    var b = Math.max(seam.arcA, seam.arcB);
    var swapped = seam.arcA > seam.arcB;
    var norm = {
      arcA: a,
      arcB: b,
      loA: swapped ? seam.loB : seam.loA,
      hiA: swapped ? seam.hiB : seam.hiA,
      loB: swapped ? seam.loA : seam.loB,
      hiB: swapped ? seam.hiA : seam.hiB,
      lengthA: swapped ? seam.lengthB : seam.lengthA,
      lengthB: swapped ? seam.lengthA : seam.lengthB
    };
    var key = arcPairKey(norm.arcA, norm.arcB);
    var group = byPair.get(key);
    if (!group) {
      group = [];
      byPair.set(key, group);
    }
    var existing = group.find(function(o) {
      return rangesOverlap(o.loA, o.hiA, norm.loA, norm.hiA) &&
        rangesOverlap(o.loB, o.hiB, norm.loB, norm.hiB);
    });
    if (existing) {
      existing.loA = Math.min(existing.loA, norm.loA);
      existing.hiA = Math.max(existing.hiA, norm.hiA);
      existing.loB = Math.min(existing.loB, norm.loB);
      existing.hiB = Math.max(existing.hiB, norm.hiB);
      existing.lengthA = Math.max(existing.lengthA, norm.lengthA);
      existing.lengthB = Math.max(existing.lengthB, norm.lengthB);
    } else {
      group.push(norm);
      out.push(norm);
    }
  });
  return out;
}

function rangesOverlap(lo1, hi1, lo2, hi2) {
  return lo1 <= hi2 && lo2 <= hi1;
}

// Snap every vertex in an accepted seam range to the midpoint between itself
// and its nearest footpoint on the opposite arc. Works with staggered vertices:
// the opposite side need not have a coinciding vertex. Mouth seed pairs are
// forced to their shared vertex midpoint so the crack tip closes exactly.
// Returns the seams that moved coordinates.
function snapSeams(seams, seeds, arcsById, arcs, footpoints, closeDistance) {
  var data = arcs.getVertexData();
  var targets = new CoordinateTargets();
  var snapped = [];

  seams.forEach(function(seam) {
    var sideA = arcsById[seam.arcA];
    var sideB = arcsById[seam.arcB];
    if (!sideA || !sideB) return;
    var before = targets.size();
    snapSideToOpposite(sideA, seam.loA, seam.hiA, sideB, arcs, footpoints,
      closeDistance, targets);
    snapSideToOpposite(sideB, seam.loB, seam.hiB, sideA, arcs, footpoints,
      closeDistance, targets);
    if (targets.size() > before) snapped.push(seam);
  });

  // Mouth pairs win over footpoint midpoints so both tips land on one point.
  var seamsByPair = indexSeamsByArcPair(seams);
  seeds.forEach(function(seed) {
    if (!(seed.distance > 0)) return;
    var group = seamsByPair.get(arcPairKey(seed.a.arc, seed.b.arc));
    if (!group || !seamContainsSeed(group, seed)) return;
    var mid = [(seed.a.x + seed.b.x) / 2, (seed.a.y + seed.b.y) / 2];
    targets.set(seed.a.x, seed.a.y, mid);
    targets.set(seed.b.x, seed.b.y, mid);
  });

  return applyTargets(arcs, targets) ? snapped : [];
}

// Snap the facing pair of vertices at each open end of a seam together, which
// closes the crack off there without disturbing the boundary between.
//
// An end counts as open when the two banks turn away from each other there. Where
// the crack carries on instead, into the next pair of arcs, pinching would divide
// one gap into a row of them -- each awarded separately, so the boundary would
// zigzag from bank to bank along a crack that should have been resolved whole.
//
// Returns the number of mouths pinched shut.
function pinchSeamMouths(seams, arcsById, arcs, nodes, footpoints, distance,
    spherical) {
  var data = arcs.getVertexData();
  var targets = new CoordinateTargets();
  var pinched = 0;

  seams.forEach(function(seam) {
    var sideA = arcsById[seam.arcA];
    var sideB = arcsById[seam.arcB];
    if (!sideA || !sideB) return;
    [seam.loA, seam.hiA].forEach(function(kA, i) {
      var outwardA = i === 0 ? -1 : 1;
      var a = sideA[kA];
      // The two runs were grown from the seed independently, so they need not end
      // opposite each other; the nearest vertex within the facing run is the one
      // to close against.
      var kB = nearestVertexInRange(a, sideB, seam.loB, seam.hiB, distance,
        spherical);
      if (kB < 0) return;
      var outwardB = kB - seam.loB < seam.hiB - kB ? -1 : 1;
      if (!endIsOpen(sideA, seam.arcA, kA, outwardA, sideB, arcs, nodes,
            footpoints, distance) &&
          !endIsOpen(sideB, seam.arcB, kB, outwardB, sideA, arcs, nodes,
            footpoints, distance)) {
        return;
      }
      var b = sideB[kB];
      var mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      var before = targets.size();
      targets.set(data.xx[a.i], data.yy[a.i], mid);
      targets.set(data.xx[b.i], data.yy[b.i], mid);
      if (targets.size() > before) pinched++;
    });
  });

  return applyTargets(arcs, targets) ? pinched : 0;
}

// True if the boundary has left the facing arc behind by the vertex just past
// @k, so that the crack ends there.
//
// Where the arc itself ends at @k, the question is what carries on past the node:
// an arc continuing along the crack keeps its next vertex within tolerance of the
// facing bank, whereas one turning away from the crack -- the coverage boundary at
// the crack's mouth, say -- does not. A crack whose banks are split into several
// arcs is walked as several seams, and this is what keeps their inner ends from
// being taken for mouths.
function endIsOpen(side, arcId, k, outward, other, arcs, nodes, footpoints,
    distance) {
  var next = k + outward;
  if (next >= 0 && next < side.length) {
    return !footpoints.closestPoint(side[next].x, side[next].y, other, distance);
  }
  var entering = outward > 0 ? arcId : ~arcId;
  var connected = nodes.getConnectedArcs(entering);
  for (var i = 0; i < connected.length; i++) {
    // Connected ids lead into the node, so the vertex adjacent to it is the last
    // but one along each.
    var v = arcs.getVertex(connected[i], -2);
    if (footpoints.closestPoint(v.x, v.y, other, distance)) return false;
  }
  return true;
}

// Index of the vertex in @side[lo..hi] nearest @vertex, or -1 if the nearest is
// further off than @maxDist or already coincides with it. A coinciding pair marks
// a tip where the two banks already meet, which needs no pinching.
function nearestVertexInRange(vertex, side, lo, hi, maxDist, spherical) {
  var best = -1;
  var bestDist = Infinity;
  for (var k = lo; k <= hi; k++) {
    var d = spherical ?
      fastLonLatDistance(vertex.x, vertex.y, side[k].x, side[k].y) :
      distance2D(vertex.x, vertex.y, side[k].x, side[k].y);
    if (d < bestDist) {
      bestDist = d;
      best = k;
    }
  }
  if (best < 0 || !(bestDist > 0) || bestDist > maxDist) return -1;
  return best;
}

// Move every occurrence of a selected coordinate, including coincident arc
// endpoints, so existing nodes remain connected. Coordinates that were not
// selected are untouched. Returns false if there was nothing to move.
function applyTargets(arcs, targets) {
  if (targets.size() === 0) return false;
  var data = arcs.getVertexData();
  for (var i = 0; i < data.xx.length; i++) {
    var target = targets.get(data.xx[i], data.yy[i]);
    if (target) {
      data.xx[i] = target[0];
      data.yy[i] = target[1];
    }
  }
  arcs.updateVertexData(data.nn, data.xx, data.yy, data.zz);
  return true;
}

// Replacement coordinates, looked up by exact x/y. Keyed by x in a Map, with a
// short bucket per x, because the lookup runs once per vertex in the whole arc
// table: building a string key for each of those is slower than the seam
// detection that precedes it.
function CoordinateTargets() {
  var byX = new Map();
  var count = 0;

  this.set = function(x, y, target) {
    var bucket = byX.get(x);
    if (!bucket) {
      bucket = [];
      byX.set(x, bucket);
    }
    for (var i = 0; i < bucket.length; i++) {
      if (bucket[i].y === y) {
        bucket[i].target = target;
        return;
      }
    }
    bucket.push({y: y, target: target});
    count++;
  };

  this.get = function(x, y) {
    var bucket = byX.get(x);
    if (!bucket) return null;
    for (var i = 0; i < bucket.length; i++) {
      if (bucket[i].y === y) return bucket[i].target;
    }
    return null;
  };

  this.size = function() { return count; };
}

function seamContainsSeed(seams, seed) {
  return seams.some(function(seam) {
    var aOnA = seed.a.arc === seam.arcA &&
      seed.a.k >= seam.loA && seed.a.k <= seam.hiA;
    var aOnB = seed.a.arc === seam.arcB &&
      seed.a.k >= seam.loB && seed.a.k <= seam.hiB;
    var bOnA = seed.b.arc === seam.arcA &&
      seed.b.k >= seam.loA && seed.b.k <= seam.hiA;
    var bOnB = seed.b.arc === seam.arcB &&
      seed.b.k >= seam.loB && seed.b.k <= seam.hiB;
    return (aOnA && bOnB) || (aOnB && bOnA);
  });
}

function snapSideToOpposite(side, lo, hi, other, arcs, footpoints, closeDistance,
    targets) {
  var data = arcs.getVertexData();
  for (var k = lo; k <= hi; k++) {
    var v = side[k];
    var foot = footpoints.closestPoint(v.x, v.y, other, closeDistance);
    if (!foot || !(foot.distance > 0)) continue;
    var mid = [(v.x + foot.x) / 2, (v.y + foot.y) / 2];
    targets.set(data.xx[v.i], data.yy[v.i], mid);
  }
}

// Nearest-point queries against an arc, indexing each arc once rather than
// scanning it per query.
//
// Growing a seam tests every vertex along one arc against the whole of the
// facing arc, and snapping repeats that for the vertices it accepted, so a scan
// per query costs the product of the two arcs' lengths. That is unnoticeable
// where a mosaic's arcs run between neighboring junctions a few vertices apart,
// but a detailed boundary is one arc of thousands of vertices, and a mosaic of
// those presents thousands of seams to walk: enough for the same repair to run
// for many minutes.
//
// The index is built from live coordinates, and seam snapping moves coordinates
// only once every seam has been measured, so one instance serves a whole pass
// over a layer and must not outlive it.
function ArcFootpoints(arcs, spherical) {
  var data = arcs.getVertexData();
  var indexes = new Map();

  function getIndex(side) {
    if (!indexes.has(side)) {
      indexes.set(side, side.length > 1 ? buildIndex(side) : null);
    }
    return indexes.get(side);
  }

  function buildIndex(side) {
    var index = new Flatbush(side.length - 1);
    for (var i = 0; i + 1 < side.length; i++) {
      var a = side[i].i, b = side[i + 1].i;
      index.add(
        Math.min(data.xx[a], data.xx[b]), Math.min(data.yy[a], data.yy[b]),
        Math.max(data.xx[a], data.xx[b]), Math.max(data.yy[a], data.yy[b]));
    }
    index.finish();
    return index;
  }

  // The nearest point on @side within @maxDist of (x, y), with that distance, or
  // null if the arc stays clear of it. A segment within @maxDist has its nearest
  // point inside the query box, so its own bounding box meets that box: no
  // segment near enough is missed. Nothing beyond @maxDist is reported, which the
  // callers discarded anyway.
  this.closestPoint = function(x, y, side, maxDist) {
    var index = getIndex(side);
    if (!index) return null;
    var padX = getCoordinatePad(maxDist, y, spherical, true);
    var padY = getCoordinatePad(maxDist, y, spherical, false);
    var ids = index.search(x - padX, y - padY, x + padX, y + padY);
    var bestD2 = Infinity, bestX = 0, bestY = 0;
    for (var k = 0; k < ids.length; k++) {
      var i = ids[k];
      var ax = data.xx[side[i].i], ay = data.yy[side[i].i];
      var dx = data.xx[side[i + 1].i] - ax, dy = data.yy[side[i + 1].i] - ay;
      var len2 = dx * dx + dy * dy;
      var t = len2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / len2 : 0;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      var fx = ax + t * dx, fy = ay + t * dy;
      var d2 = (x - fx) * (x - fx) + (y - fy) * (y - fy);
      if (d2 < bestD2) {
        bestD2 = d2;
        bestX = fx;
        bestY = fy;
      }
    }
    if (bestD2 === Infinity) return null;
    var distance = spherical ?
      fastLonLatDistance(x, y, bestX, bestY) :
      distance2D(x, y, bestX, bestY);
    if (!isFinite(distance) || distance > maxDist) return null;
    return {x: bestX, y: bestY, distance: distance};
  };
}
