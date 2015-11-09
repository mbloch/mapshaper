/* @requires
mapshaper-segment-intersection,
mapshaper-dataset-utils,
mapshaper-path-index
mapshaper-polygon-repair
*/

// Functions for dividing polygons and polygons at points where arc-segments intersect

// Divide a collection of arcs at points where segments intersect
// and re-index the paths of all the layers that reference the arc collection.
// (in-place)
MapShaper.divideArcs = function(dataset) {
  var arcs = dataset.arcs;
  T.start();
  T.start();
  var snapDist = MapShaper.getHighPrecisionSnapInterval(arcs);
  var snapCount = MapShaper.snapCoordsByInterval(arcs, snapDist);
  var dupeCount = arcs.dedupCoords();
  T.stop('snap points');
  if (snapCount > 0 || dupeCount > 0) {
    T.start();
    // Detect topology again if coordinates have changed
    api.buildTopology(dataset);
    T.stop('rebuild topology');
  }

  // clip arcs at points where segments intersect
  T.start();
  var map = MapShaper.insertClippingPoints(arcs);
  T.stop('insert clipping points');
  T.start();
  // update arc ids in arc-based layers and clean up arc geometry
  // to remove degenerate arcs and duplicate points
  var nodes = new NodeCollection(arcs);
  dataset.layers.forEach(function(lyr) {
    if (MapShaper.layerHasPaths(lyr)) {
      MapShaper.updateArcIds(lyr.shapes, map, nodes);
      // TODO: consider alternative -- avoid creating degenerate arcs
      // in insertClippingPoints()
      MapShaper.cleanShapes(lyr.shapes, arcs, lyr.geometry_type);
    }
  });
  T.stop('update arc ids / clean geometry');
  T.stop("divide arcs");
  return nodes;
};

MapShaper.updateArcIds = function(shapes, map, nodes) {
  var arcCount = nodes.arcs.size(),
      shape2;
  for (var i=0; i<shapes.length; i++) {
    shape2 = [];
    MapShaper.forEachPath(shapes[i], remapPathIds);
    shapes[i] = shape2;
  }

  function remapPathIds(ids) {
    if (!ids) return; // null shape
    var ids2 = [];
    for (var j=0; j<ids.length; j++) {
      remapArcId(ids[j], ids2);
    }
    shape2.push(ids2);
  }

  function remapArcId(id, ids) {
    var rev = id < 0,
        absId = rev ? ~id : id,
        min = map[absId],
        max = (absId >= map.length - 1 ? arcCount : map[absId + 1]) - 1,
        id2;
    do {
      if (rev) {
        id2 = ~max;
        max--;
      } else {
        id2 = min;
        min++;
      }
      // If there are duplicate arcs, always use the same one
      if (nodes) {
        id2 = nodes.findMatchingArc(id2);
      }
      ids.push(id2);
    } while (max - min >= 0);
  }
};

// divide a collection of arcs at points where line segments cross each other
// @arcs ArcCollection
// returns array that maps original arc ids to new arc ids
MapShaper.insertClippingPoints = function(arcs) {
  var points = MapShaper.findClippingPoints(arcs),
      p;
  // TODO: avoid some or all of the following if no points need to be added

  // original arc data
  var pointTotal0 = arcs.getPointCount(),
      arcTotal0 = arcs.size(),
      data = arcs.getVertexData(),
      xx0 = data.xx,
      yy0 = data.yy,
      nn0 = data.nn,
      i0 = 0,
      n0, arcLen0;

  // new arc data
  var pointTotal1 = pointTotal0 + points.length * 2,
      xx1 = new Float64Array(pointTotal1),
      yy1 = new Float64Array(pointTotal1),
      nn1 = [],  // number of arcs may vary
      i1 = 0,
      n1;

  var map = new Uint32Array(arcTotal0);

  // sort from last point to first point
  points.sort(function(a, b) {
    return b.i - a.i || b.pct - a.pct;
  });
  p = points.pop();

  for (var id0=0, id1=0; id0 < arcTotal0; id0++) {
    arcLen0 = nn0[id0];
    map[id0] = id1;
    n0 = 0;
    n1 = 0;
    while (n0 < arcLen0) {
      n1++;
      xx1[i1] = xx0[i0];
      yy1[i1++] = yy0[i0];
      while (p && p.i === i0) {
        xx1[i1] = p.x;
        yy1[i1++] = p.y;
        n1++;
        nn1[id1++] = n1; // end current arc at intersection
        n1 = 0;          // begin new arc

        xx1[i1] = p.x;
        yy1[i1++] = p.y;
        n1++;
        p = points.pop();
      }
      n0++;
      i0++;
    }
    nn1[id1++] = n1;
  }

  if (i1 != pointTotal1) error("[insertClippingPoints()] Counting error");
  arcs.updateVertexData(nn1, xx1, yy1, null);

  // segment-point intersections create duplicate points
  // TODO: consider removing call to dedupCoords() -- empty arcs are removed by cleanShapes()
  arcs.dedupCoords();
  return map;
};

MapShaper.findClippingPoints = function(arcs) {
  var intersections = MapShaper.findSegmentIntersections(arcs),
      data = arcs.getVertexData(),
      xx = data.xx,
      yy = data.yy,
      points = [];

  intersections.forEach(function(o) {
    var p1 = getSegmentIntersection(o.x, o.y, o.a),
        p2 = getSegmentIntersection(o.x, o.y, o.b);
    if (p1) points.push(p1);
    if (p2) points.push(p2);
  });

  // remove 1. points that are at arc endpoints and 2. duplicate points
  // (kludgy -- look into preventing these cases, which are caused by T intersections)
  var index = {};
  return points.filter(function(p) {
    var key = p.i + "," + p.pct;
    if (key in index) return false;
    index[key] = true;
    if (p.pct <= 0 && arcs.pointIsEndpoint(p.i) ||
        p.pct >= 1 && arcs.pointIsEndpoint(p.j)) {
      return false;
    }
    return true;
  });

  function getSegmentIntersection(x, y, ids) {
    var i = ids[0],
        j = ids[1],
        dx = xx[j] - xx[i],
        dy = yy[j] - yy[i],
        pct;
    if (i > j) error("[findClippingPoints()] Out-of-sequence arc ids");
    if (dx === 0 && dy === 0) {
      pct = 0;
    } else if (Math.abs(dy) > Math.abs(dx)) {
      pct = (y - yy[i]) / dy;
    } else {
      pct = (x - xx[i]) / dx;
    }

    if (pct < 0 || pct > 1) {
      verbose("[findClippingPoints()] Off-segment intersection (caused by rounding error");
      trace("pct:", pct, "dx:", dx, "dy:", dy, 'x:', x, 'y:', y, 'xx[i]:', xx[i], 'xx[j]:', xx[j], 'yy[i]:', yy[i], 'yy[j]:', yy[j]);
      trace("xpct:", (x - xx[i]) / dx, 'ypct:', (y - yy[i]) / dy);
      if (pct < 0) pct = 0;
      if (pct > 1) pct = 1;
    }

    return {
        pct: pct,
        i: i,
        j: j,
        x: x,
        y: y
      };
  }
};
