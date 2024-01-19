import { findSegmentIntersections } from '../paths/mapshaper-segment-intersection';
import { message, stop } from '../utils/mapshaper-logging';
import { vertexIsArcEndpoint } from '../paths/mapshaper-vertex-utils';


// arcs: ArcCollection containing original coordinates
export function getRepairFunction(arcs) {
  var arcsOrig = arcs.getCopy();
  // updatedArcs: same ArcCollection, with snapped or rounded coords
  return function(updatedArcs) {
    repairSegmentIntersections(updatedArcs, arcsOrig);
  };
}

// TODO: test with duplicate coordinates
// arcs: modified arcs (rounded coordinates)
// arcsOrig: original, unmodified arcs
export function repairSegmentIntersections(arcs, arcsOrig) {
  // Check for intersections in the original data
  var xxOrig = findSegmentIntersections(arcsOrig);
  if (xxOrig.length > 0) {
    message('Original layer contains intersections -- unable to repair.');
    return;
  }
  var intersections = findSegmentIntersections(arcs);
  var maxLoops = 10;
  var startCount = intersections.length;
  for (var i=0; i<maxLoops && intersections.length > 0; i++) {
    revertIntersectionCoordinates(intersections, arcs, arcsOrig);
    intersections = findSegmentIntersections(arcs);
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
