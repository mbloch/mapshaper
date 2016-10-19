/* @requires mapshaper-nodes mapshaper-geom */

// Return id of rightmost connected arc in relation to @arcId
// Return @arcId if no arcs can be found
MapShaper.getRightmostArc = function(arcId, nodes, filter) {
  var ids = nodes.getConnectedArcs(arcId);
  if (filter) {
    ids = ids.filter(filter);
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
    code = MapShaper.chooseRighthandSegment(fromX, fromY, nodeX, nodeY, xx[ito], yy[ito], xx[icand], yy[icand]);
    if (code == 2) {
      toId = candId;
      ito = icand;
    }
  }
  return toId;
};


// Return 1 if node->a, return 2 if node->b, else return 0
MapShaper.chooseRighthandSegment = function(fromX, fromY, nodeX, nodeY, ax, ay, bx, by) {
  var angleA = geom.signedAngle(fromX, fromY, nodeX, nodeY, ax, ay);
  var angleB = geom.signedAngle(fromX, fromY, nodeX, nodeY, bx, by);
  var code = 0;
  // TODO: handle case: angleA == 0 or angleB == 0
  if (angleA <= 0 || angleB <= 0) trace("Warning: invalid node angle");
  if (angleA < angleB) {
    code = 1;
  } else if (angleB < angleA) {
    code = 2;
  } else if (isNaN(angleA) || isNaN(angleB)) {
    // probably a duplicate point, which should not occur
    error('Invalid node geometry');
  } else {
    // fallback test, to handle case of rounding error producing equal angles
    code = MapShaper.chooseRighthandVector(ax - nodeX, ay - nodeY, bx - nodeX, by - nodeY);
  }
  return code;
};

// A fallback test for comparing two vectors with same or nearly same direction
MapShaper.chooseRighthandVector = function(ax, ay, bx, by) {
  // scale vectors to equal length and compare
  var alen = geom.distance2D(0, 0, ax, ay),
      blen = geom.distance2D(0, 0, bx, by),
      k = Math.max(alen, blen) * 4, // scale to avoid potential underflow
      ak = k / alen,
      bk = k / blen;
  return MapShaper.chooseRighthandNormalizedVector(ax * ak, ay * ak, bx * bk, by * bk);
};

// Assumes vectors have equal magnitude and are < 90 degrees apart
MapShaper.chooseRighthandNormalizedVector = function(ax, ay, bx, by) {
  var cx = (ax + bx) / 2,
      cy = (ay + by) / 2,
      v1, v2, code;
  if (Math.abs(cx) < Math.abs(cy)) { // vertical orientation: compare x
    if (cy > 0) {
      v1 = ax;
      v2 = bx;
    } else {
      v1 = bx;
      v2 = ax;
    }
  } else { // horizontal orientation: compare y
    if (cx > 0) {
      v1 = by;
      v2 = ay;
    } else {
      v1 = ay;
      v2 = by;
    }
  }
  if (v1 > v2) {
    code = 1;
  } else if (v2 > v1) {
    code = 2;
  } else {
    code = 0;
  }
  return code;
};
