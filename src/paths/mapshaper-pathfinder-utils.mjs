import { error, debug } from '../utils/mapshaper-logging';
import geom from '../geom/mapshaper-geom';


function isValidArc(arcId, arcs) {
  // check for arcs with no vertices
  // TODO: also check for other kinds of degenerate arcs
  // (e.g. collapsed arcs consisting of identical points)
  return arcs.getArcLength(arcId) > 1;
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
    if (code == 2) {
      ito = icand;
      toArcId = candId;
    }
  }


  if (toArcId == fromArcId) {
    // This shouldn't occur, assuming that other arcs are present
    error("Pathfinder error");
  }
  return toArcId;
}

function chooseRighthandPath2(fromX, fromY, nodeX, nodeY, ax, ay, bx, by) {
  return chooseRighthandVector(ax - nodeX, ay - nodeY, bx - nodeX, by - nodeY);
}

// TODO: consider using simpler internal.chooseRighthandPath2()
// Returns 1 if node->a, return 2 if node->b, else return 0
// TODO: better handling of identical angles (better -- avoid creating them)
function chooseRighthandPath(fromX, fromY, nodeX, nodeY, ax, ay, bx, by) {
  var angleA = geom.signedAngle(fromX, fromY, nodeX, nodeY, ax, ay);
  var angleB = geom.signedAngle(fromX, fromY, nodeX, nodeY, bx, by);
  var code;
  if (angleA <= 0 || angleB <= 0) {
    debug("[chooseRighthandPath()] 0 angle(s):", angleA, angleB);
    if (angleA <= 0) {
      debug('  A orient2D:', geom.orient2D(fromX, fromY, nodeX, nodeY, ax, ay));
    }
    if (angleB <= 0) {
      debug('  B orient2D:', geom.orient2D(fromX, fromY, nodeX, nodeY, bx, by));
    }
    // TODO: test against "from" segment
    if (angleA > 0) {
      code = 1;
    } else if (angleB > 0) {
      code = 2;
    } else {
      code = 0;
    }
  } else if (angleA < angleB) {
    code = 1;
  } else if (angleB < angleA) {
    code = 2;
  } else if (isNaN(angleA) || isNaN(angleB)) {
    // probably a duplicate point, which should not occur
    error('Invalid node geometry');
  } else {
    // Equal angles: use fallback test that is less sensitive to rounding error
    code = chooseRighthandVector(ax - nodeX, ay - nodeY, bx - nodeX, by - nodeY);
    debug('[chooseRighthandPath()] equal angles:', angleA, 'fallback test:', code);
  }
  return code;
}

export function chooseRighthandVector(ax, ay, bx, by) {
  var orient = geom.orient2D(ax, ay, 0, 0, bx, by);
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
