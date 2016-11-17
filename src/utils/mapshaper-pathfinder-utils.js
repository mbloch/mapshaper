/* @requires mapshaper-nodes mapshaper-geom */

// Return id of rightmost connected arc in relation to @arcId
// Return @arcId if no arcs can be found
MapShaper.getRightmostArc = function(arcId, nodes, filter) {
  var ids = nodes.getConnectedArcs(arcId);
  if (filter) {
    ids = ids.filter(filter);
  }
  if (ids.length === 0) {
    return arcId; // error condition, handled by caller
  }
  return MapShaper.getRighmostArc2(arcId, ids, nodes.arcs);
};

MapShaper.getRighmostArc2 = function(fromId, ids, arcs) {
  var coords = arcs.getVertexData(),
      xx = coords.xx,
      yy = coords.yy,
      inode = arcs.indexOfVertex(fromId, -1),
      nodeX = xx[inode],
      nodeY = yy[inode],
      ifrom = arcs.indexOfVertex(fromId, -2),
      fromX = xx[ifrom],
      fromY = yy[ifrom],
      toId = fromId, // initialize to from-arc -- an error
      ito, candId, icand, code, j;

  /*if (x == ax && y == ay) {
    error("Duplicate point error");
  }*/
  if (ids.length > 0) {
    toId = ids[0];
    ito = arcs.indexOfVertex(toId, -2);
  }

  for (j=1; j<ids.length; j++) {
    candId = ids[j];
    icand = arcs.indexOfVertex(candId, -2);
    code = MapShaper.chooseRighthandPath(fromX, fromY, nodeX, nodeY, xx[ito], yy[ito], xx[icand], yy[icand]);
    if (code == 2) {
      toId = candId;
      ito = icand;
    }
  }
  if (toId == fromId) {
    // This shouldn't occur, assuming that other arcs are present
    error("Pathfinder error");
  }
  return toId;
};

// Returns 1 if node->a, return 2 if node->b, else return 0
// TODO: better handling of identical angles (better -- avoid creating them)
MapShaper.chooseRighthandPath = function(fromX, fromY, nodeX, nodeY, ax, ay, bx, by) {
  var angleA = geom.signedAngle(fromX, fromY, nodeX, nodeY, ax, ay);
  var angleB = geom.signedAngle(fromX, fromY, nodeX, nodeY, bx, by);
  var code;
  if (angleA <= 0 || angleB <= 0) {
    trace("[chooseRighthandPath()] 0 angle(s):", angleA, angleB);
    if (angleA <= 0) {
      trace('  A orient2D:', geom.orient2D(fromX, fromY, nodeX, nodeY, ax, ay));
    }
    if (angleB <= 0) {
      trace('  B orient2D:', geom.orient2D(fromX, fromY, nodeX, nodeY, bx, by));
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
    code = MapShaper.chooseRighthandVector(ax - nodeX, ay - nodeY, bx - nodeX, by - nodeY);
    trace("[chooseRighthandVector()] code:", code, 'angle:', angleA);
    trace(fromX, fromY, nodeX, nodeY, ax, ay, bx, by);
  }
  return code;
};

MapShaper.chooseRighthandVector = function(ax, ay, bx, by) {
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
};
