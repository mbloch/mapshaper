import { findSegmentIntersections } from '../paths/mapshaper-segment-intersection';
import { findArcIdFromVertexId } from '../paths/mapshaper-arc-utils';
import { message, stop } from '../utils/mapshaper-logging';
import { vertexIsArcEndpoint } from '../paths/mapshaper-vertex-utils';

// Reverting an arc can leave it crossing a neighbor that is still modified, so
// the check is repeated; each pass reverts more arcs than the last, and the
// unmodified geometry is the floor.
var MAX_REPAIR_PASSES = 10;


// arcs: ArcCollection containing original coordinates
// arcFilter (optional): returns false for arcs to leave out, see
//   findSegmentIntersections()
export function getRepairFunction(arcs, arcFilter) {
  var arcsOrig = arcs.getCopy();
  // updatedArcs: same ArcCollection, with snapped or rounded coords
  return function(updatedArcs) {
    repairSegmentIntersections(updatedArcs, arcsOrig, arcFilter);
  };
}

// TODO: test with duplicate coordinates
// arcs: modified arcs (rounded coordinates)
// arcsOrig: original, unmodified arcs
export function repairSegmentIntersections(arcs, arcsOrig, arcFilter) {
  var opts = {arcFilter: arcFilter};
  // Check for intersections in the original data
  var xxOrig = findSegmentIntersections(arcsOrig, opts);
  if (xxOrig.length > 0) {
    message('Original layer contains intersections -- unable to repair.');
    return;
  }
  var intersections = findSegmentIntersections(arcs, opts);
  var maxLoops = 10;
  var startCount = intersections.length;
  for (var i=0; i<maxLoops && intersections.length > 0; i++) {
    revertIntersectionCoordinates(intersections, arcs, arcsOrig);
    intersections = findSegmentIntersections(arcs, opts);
  }
  var finalCount = intersections.length;
  if (finalCount > 0) {
    message('Unable to remove', finalCount, `intersection${finalCount > 1 ? 's' : ''}`);
  } else if (startCount > 0) {
    message('Fix-geometry removed', startCount,  `intersection${startCount > 1 ? 's' : ''}`);
  }
}

// arcs: modified (rounded) coords
// arcsOrig: original coords
function revertIntersectionCoordinates(intersections, arcs, arcsOrig) {
  intersections.forEach(function(o) {
    replaceVertexCoords(o.a[0], arcs, arcsOrig);
    replaceVertexCoords(o.a[1], arcs, arcsOrig);
    replaceVertexCoords(o.b[0], arcs, arcsOrig);
    replaceVertexCoords(o.b[1], arcs, arcsOrig);
  });
}

// idx: index of vertex to replace
// arcs: target arcs
// arcs2: arcs with replacement coordinates
function replaceVertexCoords(idx, arcs, arcs2) {
  var data = arcs.getVertexData();
  var data2 = arcs2.getVertexData();
  var idxx = [idx];
  if (vertexIsArcEndpoint(idx, arcs)) {
    idxx = idxx.concat(findMatchingEndpoints(idx, data));
  }
  idxx.forEach(function(idx) {
    data.xx[idx] = data2.xx[idx];
    data.yy[idx] = data2.yy[idx];
  });
}

// Remove intersections from a whole-collection edit (such as smoothing) by
// putting the arcs that cross back the way they were. Reverting per arc, rather
// than per vertex, is what suits an edit that resamples a path: the modified and
// original versions of an arc need not share a vertex count.
//
// arcs: modified arcs, edited in place
// arcsOrig: the same arcs, in the same order, before the edit
// Returns {reverted: number of arcs put back, remaining: crossings left}
export function repairCrossedArcs(arcs, arcsOrig) {
  var intersections = findSegmentIntersections(arcs, {});
  var reverted = null;
  var pass = 0;
  while (intersections.length > 0 && pass++ < MAX_REPAIR_PASSES) {
    reverted = reverted || new Uint8Array(arcs.size());
    // Nothing new to try: the arcs that cross are already unmodified.
    if (markCrossedArcs(intersections, arcs, reverted) === 0) break;
    revertArcs(arcs, arcsOrig, reverted);
    intersections = findSegmentIntersections(arcs, {});
  }
  return {
    reverted: reverted ? countMarked(reverted) : 0,
    remaining: intersections.length
  };
}

// Flags the arcs taking part in each intersection; returns how many were newly
// flagged.
function markCrossedArcs(intersections, arcs, marked) {
  var ii = arcs.getVertexData().ii;
  var added = 0;
  intersections.forEach(function(o) {
    [findArcIdFromVertexId(o.a[0], ii), findArcIdFromVertexId(o.b[0], ii)]
      .forEach(function(arcId) {
        if (marked[arcId]) return;
        marked[arcId] = 1;
        added++;
      });
  });
  return added;
}

function revertArcs(arcs, arcsOrig, marked) {
  var mod = arcs.getVertexData();
  var orig = arcsOrig.getVertexData();
  var nn = [], xx = [], yy = [];
  var i, j, src, start, len;
  for (i = 0; i < marked.length; i++) {
    src = marked[i] ? orig : mod;
    start = src.ii[i];
    len = src.nn[i];
    nn.push(len);
    for (j = 0; j < len; j++) {
      xx.push(src.xx[start + j]);
      yy.push(src.yy[start + j]);
    }
  }
  arcs.updateVertexData(nn, xx, yy);
}

function countMarked(marked) {
  var count = 0;
  for (var i = 0; i < marked.length; i++) {
    if (marked[i]) count++;
  }
  return count;
}

// idx: index of an arc endpoint
function findMatchingEndpoints(idx, data) {
  var ii = data.ii, nn = data.nn, xx = data.xx, yy = data.yy;
  var x = xx[idx], y = yy[idx];
  var a, b;
  var matches = [];
  for (var j=0; j<ii.length; j++) {
    a = ii[j];
    b = a + nn[j] - 1;
    if (a != idx && xx[a] == x && yy[a] == y) {
      matches.push(a);
    }
    if (b != idx && xx[b] == x && yy[b] == y) {
      matches.push(b);
    }
  }
  return matches;
}
