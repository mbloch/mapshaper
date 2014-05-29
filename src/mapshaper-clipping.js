/* @requires
mapshaper-merging,
mapshaper-segments,
mapshaper-dataset-utils,
mapshaper-endpoints
*/

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
    arcs: mergedArcs
  };
};

MapShaper.clipLayer = function(lyrA, lyrB, arcs, opts) {
  // slice layers
  // MapShaper.intersectLayers(lyrA, lyrB, arcs);

};

MapShaper.intersectLayers = function(lyrA, lyrB, arcs) {
  // 1. divide arcs
  var map = MapShaper.insertClippingPoints(arcs);

  // 2. update arc ids in layers
  MapShaper.updateArcIds(lyrA.shapes, map, arcs);
  MapShaper.updateArcIds(lyrB.shapes, map, arcs);
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
      nn1 = new Uint32Array(arcTotal1),
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
    while (n0++ < arcLen0) {
      n1++;
      xx1[i1] = xx0[i0];
      yy1[i1++] = yy0[i0];
      while (p && p.i === i0) {
        // end current arc at intersection
        nn1[id1++] = n1 + 1;
        xx1[i1] = p.x;
        yy1[i1++] = p.y;
        // begin new arc at intersection
        n1 = 1;
        xx1[i1] = p.x;
        yy1[i1++] = p.y;
        p = points.pop();
      }
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
      xx = arcs.getVertexData().xx,
      yy = arcs.getVertexData().yy,
      points = [];

  intersections.forEach(function(o) {
    var ids = o.ids,
        p1 = getSegmentIntersection(o.intersection, ids[0], ids[1]),
        p2 = getSegmentIntersection(o.intersection, ids[2], ids[3]);
    points.push(p1);
    points.push(p2);
  });

  return points;

  function getSegmentIntersection(p, a, b) {
    var i = a < b ? a : b,
        j = i === a ? b : a,
        xi = xx[i],
        xj = xx[j],
        yi = yy[i],
        yj = yy[j],
        dx = xj - xi,
        dy = yj - yi,
        pct = Math.abs(dy) > Math.abs(dx) ? (p.y - yi) / dy : (p.x - xi) / dx;
        obj = {
          pct: pct,
          i: i,
          x: p.x,
          y: p.y
        };

    // error condition: point does not fall between segment endpoints
    if (obj.pct < 0 || obj.pct > 1) {
      error("[findClippingPoints()] Invalid intersection:", obj);
    }
    return obj;
  }
};
