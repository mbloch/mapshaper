/* @requires
mapshaper-merging,
mapshaper-segments,
mapshaper-dataset-utils,
mapshaper-endpoints,
mapshaper-shape-geom
*/

api.divideArcs = function(layers, arcs, opts) {
  // divide arcs
  var map = MapShaper.insertClippingPoints(arcs);

  // update arc ids in arc-based layers
  layers.forEach(function(lyr) {
    if (lyr.geometry_type == 'polyline' || lyr.geometry_type == 'polygon') {
      MapShaper.updateArcIds(lyr.shapes, map, arcs);
    }
  });
};

// Assumes layer and arcs have been processed with divideArcs()
api.divideLayer = function(lyr, arcs, opts) {
  if (lyr.geometry_type != 'polygon') {
    stop("[divideLayer()] expected polygon layer, received:", lyr.geometry_type);
  }
  return MapShaper.dividePolygonLayer(lyr, arcs);
};


MapShaper.intersectDatasets = function(a, b, opts) {
  if (!a.arcs || !b.arcs) error("[intersectDatasets()] Needs two datasets with arcs");
  // 1. combine arc datasets
  var sizeA = a.arcs.size(),
      sizeB = b.arcs.size(),
      lyrA = a.layers[0],
      lyrB = b.layers[0],
      mergedArcs = MapShaper.mergeArcs([a.arcs, b.arcs]);
  a.arcs = null; // delete original arcs for gc
  b.arcs = null;

  // 2. remap arc ids
  MapShaper.forEachArcId(lyrB.shapes, function(id) {
    return id >= 0 ? id + sizeA : ~(~id + sizeA);
  });

  var lyrC = MapShaper.intersectLayers(lyrA, lyrB, mergedArcs, opts);
  return {
    layers: [lyrC],
    arcs: mergedArcs,
  };
};


MapShaper.updateArcIds = function(shapes, map, arcs) {
  var arcCount = arcs.size(),
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
        max = (absId >= map.length - 1 ? arcCount : map[absId + 1]) - 1;
    do {
      if (rev) {
        ids.push(~max);
        max--;
      } else {
        ids.push(min);
        min++;
      }
    } while (max - min >= 0);
  }
};

// divide a collection of arcs at points where line segments cross each other
// @arcs ArcCollection
// returns array that maps original arc ids to new arc ids
MapShaper.insertClippingPoints = function(arcs) {
  var points = MapShaper.findClippingPoints(arcs),
      p,

      // original arc data
      pointTotal0 = arcs.getPointCount(),
      arcTotal0 = arcs.size(),
      data = arcs.getVertexData(),
      xx0 = data.xx,
      yy0 = data.yy,
      nn0 = data.nn,
      i0 = 0,
      n0, arcLen0,

      // new arc data
      pointTotal1 = pointTotal0 + points.length * 2,
      arcTotal1 = arcTotal0 + points.length,
      xx1 = new Float64Array(pointTotal1),
      yy1 = new Float64Array(pointTotal1),
      nn1 = [],  // number of arcs may vary
      i1 = 0,
      n1,

      map = new Uint32Array(arcTotal0);

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
  // (alternative would be to filter out dupes above)
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
  points = Utils.filter(points, function(p) {
    var key = p.i + "," + p.pct;
    if (key in index) return false;
    index[key] = true;
    if (p.pct === 0 && pointIsEndpoint(p.i, data.ii, data.nn)) return false;
    return true;
  });

  return points;

  function pointIsEndpoint(idx, ii, nn) {
    // intersections at endpoints are unlikely, so just scan for them
    for (var j=0, n=ii.length; j<n; j++) {
      if (idx === ii[j] || idx === ii[j] + nn[j] - 1) return true;
    }
    return false;
  }

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

    if (pct < 0 || pct >= 1) error("[findClippingPoints()] Off-segment intersection");
    return {
        pct: pct,
        i: i,
        j: j,
        x: x,
        y: y
      };
  }
};

MapShaper.dividePolygonLayer = function(lyr, arcs) {
  var nodes = new NodeCollection(arcs),
      shapes = lyr.shapes,
      dividedShapes = [];

  var flags = new Uint8Array(arcs.size()); // 0 = unused, 1 = fw, 2 = rev
  shapes.forEach(function(shape, i) {
    if (shape) {
      Utils.merge(dividedShapes, dividePolygon(shape));
    }
  });

  return utils.defaults({shapes: dividedShapes, data: null}, lyr);

  // TODO: divide according to intersection type: a, b, a+b
  function dividePolygon(shape) {
    var dividedPaths = [];
    MapShaper.forEachPath(shape, function(ids) {
      var isCW = geom.getPathArea(arcs.getShapeIter(ids)) > 0,
          path;
      for (var i=0; i<ids.length; i++) {
        path = getDividedPath(ids[i], isCW, nodes);
        if (path) dividedPaths.push([path]);
      }
    });
    return dividedPaths;
  }

  function tryArc(id) {
    var abs = id < 0 ? ~id : id,
        flag = abs == id ? 1 : 2, // 1 -> forward arc, 2 -> rev arc
        unused = (flags[abs] & flag) === 0;
    flags[abs] |= flag; // set flag
    return unused;
  }

  function getDividedPath(arc0, isCW, nodes) {
    // console.log("  getDividedPath() arc0:", arc0, "cw?", isCW, "flags:", Utils.toArray(flags));
    var path = [],
        nextId = arc0;
    do {
      if (!tryArc(nextId)) return null;
      path.push(nextId);
      nextId = nodes.getNextArc(nextId, isCW);
    } while (nextId != arc0);
    return path;
  }
};
