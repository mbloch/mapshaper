/* @requires
mapshaper-segment-intersection,
mapshaper-dataset-utils,
mapshaper-path-index
mapshaper-polygon-repair
*/

// Functions for dividing polygons and polygons at points where arc-segments intersect

// TODO: rename this function to something like repairTopology
//    (consider using it at import to build initial topology)
//    Improve efficiency (e.g. only update ArcCollection once)
//    Remove junk arcs (collapsed and duplicate arcs) instead of just removing
//       references to them

// Divide a collection of arcs at points where segments intersect
// and re-index the paths of all the layers that reference the arc collection.
// (in-place)
MapShaper.addIntersectionCuts = function(dataset, opts) {
  var arcs = dataset.arcs;
  var snapDist = MapShaper.getHighPrecisionSnapInterval(arcs);
  var snapCount = opts && opts.no_snap ? 0 : MapShaper.snapCoordsByInterval(arcs, snapDist);
  var dupeCount = arcs.dedupCoords();
  if (snapCount > 0 || dupeCount > 0) {
    // Detect topology again if coordinates have changed
    api.buildTopology(dataset);
  }

  // cut arcs at points where segments intersect
  var map = MapShaper.divideArcs(arcs);

  // update arc ids in arc-based layers and clean up arc geometry
  // to remove degenerate arcs and duplicate points
  var nodes = new NodeCollection(arcs);
  dataset.layers.forEach(function(lyr) {
    if (MapShaper.layerHasPaths(lyr)) {
      MapShaper.updateArcIds(lyr.shapes, map, nodes);
      // Clean shapes by removing collapsed arc references, etc.
      // TODO: consider alternative -- avoid creating degenerate arcs
      // in insertCutPoints()
      MapShaper.cleanShapes(lyr.shapes, arcs, lyr.geometry_type);
    }
  });
  return nodes;
};

// Divides a collection of arcs at points where arc paths cross each other
// Returns array for remapping arc ids
MapShaper.divideArcs = function(arcs) {
  var points = MapShaper.findClippingPoints(arcs);
  // TODO: avoid the following if no points need to be added
  var map = MapShaper.insertCutPoints(points, arcs);
  // segment-point intersections currently create duplicate points
  arcs.dedupCoords();
  return map;
};

// Inserts array of cutting points into an ArcCollection
// Returns array for remapping arc ids
MapShaper.insertCutPoints = function(unfilteredPoints, arcs) {
  var data = arcs.getVertexData(),
      xx0 = data.xx,
      yy0 = data.yy,
      nn0 = data.nn,
      i0 = 0,
      i1 = 0,
      nn1 = [],
      srcArcTotal = arcs.size(),
      map = new Uint32Array(srcArcTotal),
      points = MapShaper.filterSortedCutPoints(MapShaper.sortCutPoints(unfilteredPoints, xx0, yy0), arcs),
      destPointTotal = arcs.getPointCount() + points.length * 2,
      xx1 = new Float64Array(destPointTotal),
      yy1 = new Float64Array(destPointTotal),
      n0, n1, arcLen, p;

  points.reverse(); // reverse sorted order to use pop()
  p = points.pop();

  for (var srcArcId=0, destArcId=0; srcArcId < srcArcTotal; srcArcId++) {
    // start merging an arc
    arcLen = nn0[srcArcId];
    map[srcArcId] = destArcId;
    n0 = 0;
    n1 = 0;
    while (n0 < arcLen) {
      // copy another point
      xx1[i1] = xx0[i0];
      yy1[i1] = yy0[i0];
      i1++;
      n1++;
      while (p && p.i == i0) {
        // interpolate any clip points that fall within the current segment
        xx1[i1] = p.x;
        yy1[i1] = p.y;
        i1++;
        n1++;
        nn1[destArcId++] = n1; // end current arc at intersection
        n1 = 0; // begin new arc
        xx1[i1] = p.x;
        yy1[i1] = p.y;
        i1++;
        n1++;
        p = points.pop();
      }
      n0++;
      i0++;
    }
    nn1[destArcId++] = n1;
  }

  if (i1 != destPointTotal) error("[insertCutPoints()] Counting error");
  arcs.updateVertexData(nn1, xx1, yy1, null);
  return map;
};

MapShaper.convertIntersectionsToCutPoints = function(intersections, xx, yy) {
  var points = [], ix, a, b;
  for (var i=0, n=intersections.length; i<n; i++) {
    ix = intersections[i];
    a = MapShaper.getCutPoint(ix.x, ix.y, ix.a[0], ix.a[1], xx, yy);
    b = MapShaper.getCutPoint(ix.x, ix.y, ix.b[0], ix.b[1], xx, yy);
    if (a) points.push(a);
    if (b) points.push(b);
  }
  return points;
};

MapShaper.getCutPoint = function(x, y, i, j, xx, yy) {
  var ix = xx[i],
      iy = yy[i],
      jx = xx[j],
      jy = yy[j];
  if (j < i || j > i + 1) {
    error("Out-of-sequence arc ids:", i, j);
  }
  if (geom.outsideRange(x, ix, jx) || geom.outsideRange(y, iy, jy)) {
    // out-of-range issues should have been handled upstream
    trace("[getCutPoint()] Coordinate range error");
    return null;
  }
  return {x: x, y: y, i: i};
};

// Sort insertion points in order of insertion
// Insertion order: ascending id of first endpoint of containing segment and
//   ascending distance from same endpoint.
MapShaper.sortCutPoints = function(points, xx, yy) {
  points.sort(function(a, b) {
    return a.i - b.i ||
      Math.abs(a.x - xx[a.i]) - Math.abs(b.x - xx[b.i]) ||
      Math.abs(a.y - yy[a.i]) - Math.abs(b.y - yy[b.i]);
  });
  return points;
};

// Removes duplicate points and arc endpoints
MapShaper.filterSortedCutPoints = function(points, arcs) {
  var filtered = [],
      pointId = 0;
  arcs.forEach2(function(i, n, xx, yy) {
    var j = i + n - 1,
        x0 = xx[i],
        y0 = yy[i],
        xn = xx[j],
        yn = yy[j],
        p, pp;

    while (pointId < points.length && points[pointId].i <= j) {
      p = points[pointId];
      pp = filtered[filtered.length - 1];
      if (p.x == x0 && p.y == y0 || p.x == xn && p.y == yn) {
        // clip point is an arc endpoint -- discard
      } else if (pp && pp.x == p.x && pp.y == p.y && pp.i == p.i) {
        // clip point is a duplicate -- discard
      } else {
        filtered.push(p);
      }
      pointId++;
    }
  });
  return filtered;
};

MapShaper.findClippingPoints = function(arcs) {
  var intersections = MapShaper.findSegmentIntersections(arcs),
      data = arcs.getVertexData();
  return MapShaper.convertIntersectionsToCutPoints(intersections, data.xx, data.yy);
};

// Updates arc ids in @shapes array using @map object
// ... also, removes references to duplicate arcs
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
      // If there are duplicate arcs, switch to the same one
      if (nodes) {
        id2 = nodes.findMatchingArc(id2);
      }
      ids.push(id2);
    } while (max - min >= 0);
  }
};
