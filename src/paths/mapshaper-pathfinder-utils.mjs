import { error, debug, useDebug } from '../utils/mapshaper-logging';
import geom from '../geom/mapshaper-geom';
import { orient2D_robust } from '../geom/mapshaper-segment-geom';
// import { orient2D_big2 as orient2D_robust } from '../geom/mapshaper-segment-geom-big';
import {
  getArcEndpointCoords
} from '../paths/mapshaper-vertex-utils';
import {
  debugDuplicatePathfinderSegments,
  debugConnectedArcs
} from '../utils/mapshaper-debug-utils';

function pointsAreEqual(a, b) {
  return a && b && a[0] === b[0] && a[1] === b[1];
}

function isValidArc(arcId, arcs) {
  // check for arcs with no vertices
  // TODO: also check for other kinds of degenerate arcs
  // (e.g. collapsed arcs consisting of identical points)
  var len = arcs.getArcLength(arcId);
  if (len >= 2 === false) {
    return false;
  }
  // if (len <=3) {
  //   var endpoints = getArcEndpointCoords(arcId, arcs);
  //   if (pointsAreEqual(endpoints[0], endpoints[1])) {
  //     return false;
  //   }
  // }
  return true;
}

// Return id of rightmost connected arc in relation to @fromArcId
// Return @fromArcId if no arcs can be found
export function getRightmostArc(fromArcId, nodes, filter) {
  var arcs = nodes.arcs,
      coords = arcs.getVertexData(),
      xx = coords.xx,
      yy = coords.yy,
      ids = nodes.getConnectedArcs(fromArcId),
      toArcId = fromArcId; // initialize to fromArcId -- an error condition
  if (filter) {
    ids = ids.filter(filter);
  }

  if (!isValidArc(fromArcId, arcs) || ids.length === 0) {
    return fromArcId;
  }

  var inode = arcs.indexOfVertex(fromArcId, -1),
      nodeX = xx[inode],
      nodeY = yy[inode],
      ifrom = arcs.indexOfVertex(fromArcId, -2),
      fromX = xx[ifrom],
      fromY = yy[ifrom],
      ito, candId, icand, code, j;

  /*if (x == ax && y == ay) {
    error("Duplicate point error");
  }*/

  for (j=0; j<ids.length; j++) {
    candId = ids[j];
    if (!isValidArc(candId, arcs)) {
      // skip empty arcs
      debug('skipping one arc:', candId, 'out of:', ids.length, ids);
      continue;
    }
    icand = arcs.indexOfVertex(candId, -2);
    if (toArcId == fromArcId) {
      // first valid candidate
      ito = icand;
      toArcId = candId;
      continue;
    }
    code = chooseRighthandPath(fromX, fromY, nodeX, nodeY, xx[ito], yy[ito], xx[icand], yy[icand]);

    if (xx[ito] == xx[icand] && yy[ito] == yy[icand]) {
      debug("Pathfinder warning: duplicate segments: i:", ito, "j:", icand, "ids:", [fromArcId].concat(ids));
      if (useDebug()) {
        // debugDuplicatePathfinderSegments(nodeX, nodeY, ito, icand, nodes.arcs);
        debugConnectedArcs(ids, nodes.arcs);
      }
    }
    if (code == 2) {
      ito = icand;
      toArcId = candId;
    }
  }


  if (toArcId == fromArcId) {
    // This shouldn't occur, assuming that other arcs are present
    error("Pathfinder error", toArcId, fromArcId);
  }
  return toArcId;
}

// Returns 1 if node->a, return 2 if node->b, else return 0
// TODO: better handling of identical angles (better -- avoid creating them)
function chooseRighthandPath(fromX, fromY, nodeX, nodeY, ax, ay, bx, by) {
  var angleA = geom.signedAngle(fromX, fromY, nodeX, nodeY, ax, ay);
  var angleB = geom.signedAngle(fromX, fromY, nodeX, nodeY, bx, by);
  // should use arbitrary precision math to evaluate angles smaller than this
  // (all observed errors caused by fp rounding occured with smaller angles than this)
  var smallAngle = 0.001;
  var code;
  if (angleA <= 0 || angleB <= 0) {
    debug("[chooseRighthandPath()] 0 angle(s):", angleA, angleB);
    // TODO: test against "from" segment
    if (angleA > 0) {
      code = 1;
    } else if (angleB > 0) {
      code = 2;
    } else {
      code = 0;
    }
  } else if (angleA < angleB - smallAngle) {
    code = 1;
  } else if (angleB < angleA - smallAngle) {
    code = 2;
  } else if (isNaN(angleA) || isNaN(angleB)) {
    // probably a duplicate point, which should not occur
    error('Invalid node geometry');
  } else {
    // Close-to-equal or equal angles: use more exact test.
    code = chooseBetweenClosePaths(nodeX, nodeY, ax, ay, bx, by);
    // debug('[chooseRighthandPath()] close-to-equal angles:', Math.abs(angleA) - Math.abs(angleB), 'hi-res code:', code);
  }
  return code;
}

export function chooseBetweenClosePaths(nodeX, nodeY, ax, ay, bx, by) {
  var orient = orient2D_robust(ax, ay, nodeX, nodeY, bx, by);
  var code;
  if (orient > 0) {
    code = 2;
  } else if (orient < 0) {
    code = 1;
  } else {
    code = 0;
  }
  return code;
}
