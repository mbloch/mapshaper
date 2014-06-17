/* @requires
mapshaper-merging,
mapshaper-segments,
mapshaper-dataset-utils,
mapshaper-endpoints,
mapshaper-shape-geom,
mapshaper-path-index
*/

api.clipLayer = function(targetLyr, clipLyr, arcs, opts) {
  return MapShaper.intersectLayers(targetLyr, clipLyr, arcs, "clip", opts);
};

api.eraseLayer = function(targetLyr, clipLyr, arcs, opts) {
  return MapShaper.intersectLayers(targetLyr, clipLyr, arcs, "erase", opts);
};

// enable arc pathways in a single shape or array of shapes
// flags: 0 = unset, 1 = fwd open, 2 = rev open, 4 = fwd/rev blocked
MapShaper.openArcPathways = function(arcIds, arcs, flags, fwd, rev, xor) {
  MapShaper.forEachArcId(arcIds, function(id) {
    var isInv = id < 0,
        absId = isInv ? ~id : id,
        currFlag = flags[absId],
        newFlag = 0;

    if (fwd) newFlag |= isInv ? 2 : 1;
    if (rev) newFlag |= isInv ? 1 : 2;

    // careful: this might not work right if an arc is shared between target and source polygons,
    // and in some other situations
    // option: use 4 to prevent division along shared boundaries in the clip layer
    // alternative: dissolve clip-layer shapes to remove shared boundaries
    if ((currFlag & 3) > 0) {
      // if (newFlag == currFlag) console.log("warning: duplicate arc pathway");
      newFlag = xor ? 4 : currFlag | newFlag;
    }
    // error condition: lollipop arcs can cause problems; block these
    if (arcs.arcIsLollipop(id)) {
      newFlag = 4;
    }
    flags[absId] = newFlag;
  });
};

MapShaper.initClippingFlags = function(clipShapes, arcs, type) {
  var flags = new Uint8Array(arcs.size());
  MapShaper.openArcPathways(clipShapes, arcs, flags, type == 'clip', type == 'erase', true);
  return flags;
};

MapShaper.initDivideFlags = function(targetShapes, divideShapes, arcs) {
  var flags = new Uint8Array(arcs.size());
  MapShaper.openArcPathways(targetShapes, arcs, flags, true, false, false);
  MapShaper.openArcPathways(divideShapes, arcs, flags, true, true, false);
  return flags;
};

MapShaper.initDissolveFlags = function(shapes, arcs) {
  var flags = new Uint8Array(arcs.size());
  MapShaper.openArcPathways(shapes, arcs, flags, true, false, true);
  return flags;
};

MapShaper.getPathSplitter = function(arcs, flags) {
  var nodes = new NodeCollection(arcs);

  function testArc(id) {
    var abs = id < 0 ? ~id : id;
    return (flags[abs] & 4) === 0;
  }

  function useArc(id) {
    var abs = id < 0 ? ~id : id,
        flag = flags[abs],
        pathway = abs == id ? 1 : 2, // 1 -> forward arc, 2 -> rev arc
        isOpen = (flag & pathway) > 0;
    if (isOpen) {
      flag = flag & ~pathway; // close pathway
      flag = flag | 8; // add 'used' flag
    }
    flags[abs] = flag;
    return isOpen;
  }

  return function(startId) {
    var path = [],
        nextId, msg,
        candId = startId,
        verbose = false;

    do {
      if (verbose) msg = (nextId === undefined ? " " : "  " + nextId) + " -> " + candId;
      if (useArc(candId)) {
        path.push(candId);
        nextId = candId;
      } else {
        if (verbose) console.log(msg + " x");
        return null;
      }
      if (verbose) console.log(msg);

      candId = nodes.getNextArc(nextId, true, testArc);
      if (candId == ~nextId) {
        console.log("dead-end");
        return null;
      }
    } while (candId != startId);
    return path.length === 0 ? null : path;
  };
};


// @type: 'clip' or 'erase'
MapShaper.intersectLayers = function(targetLyr, clipLyr, arcs, type, opts) {
  if (targetLyr.geometry_type != 'polygon' || clipLyr.geometry_type != 'polygon') {
    stop("[intersectLayers()] Expected two polygon layers, received",
      targetLyr.geometry_type, "and", clipLyr.geometry_type);
  }

  var flags = MapShaper.initClippingFlags(clipLyr.shapes, arcs, type),
      dividePath = MapShaper.getPathSplitter(arcs, flags),
      dividedShapes = clipPolygons(targetLyr.shapes, clipLyr.shapes, arcs, type),
      dividedLyr = Utils.defaults({shapes: dividedShapes, data: null}, targetLyr);

  if (targetLyr.data) {
    dividedLyr.data = opts.no_replace ? targetLyr.data.clone() : targetLyr.data;
  }
  return dividedLyr;

  function clipPolygons(targetShapes, clipShapes, arcs, type) {
    var index = new PathIndex(clipShapes, arcs);
    var clippedShapes = targetShapes.map(function(shape) {
      var clipped = null;
      if (shape) {
        MapShaper.openArcPathways(shape, arcs, flags, true, false, false);
        clipped = clipPolygon(shape, type, index);
      }
      return clipped;
    });

    // add clip/erase polygons that are fully contained in a target polygon
    // need to index only non-intersecting clip shapes
    // (Intersecting shapes have already been processed)
    var undividedClipShapes = findUndividedShapes(clipShapes, flags);
    index = new PathIndex(undividedClipShapes, arcs);
    targetShapes.forEach(function(shape, shapeId) {
      var paths = findInteriorPaths(shape, type, index);
      if (paths) {
        clippedShapes[shapeId] = (clippedShapes[shapeId] || []).concat(paths);
      }
    });

    return clippedShapes;
  }

  // Filter a collection of shapes to exclude paths that were modified by clipping
  function findUndividedShapes(shapes, flags) {
    return shapes.map(function(shape) {
      var parts = [];
      MapShaper.forEachPath(shape, function(ids) {
        var undivided = true, id, abs;
        for (var i=0; i<ids.length; i++) {
          id = ids[i];
          abs = (id < 0) ? ~id : id;
          if ((flags[abs] & 8) > 0) {
            undivided = false;
            break;
          }
        }
        if (undivided) parts.push(ids);
      });
      return parts.length > 0 ? parts : null;
    });
  }

  // search for indexed clipping paths contained in a shape
  function findInteriorPaths(shape, type, index) {
    var enclosedPaths = index.findPathsInsideShape(shape);
    if (!enclosedPaths) return null;
    var paths = [];
    enclosedPaths.forEach(function(ids) {
      var path;
      if (type == 'erase') {
        ids = ids.concat();
        MapShaper.reversePath(ids);
      }
      for (var j=0; j<ids.length; j++) {
        path = dividePath(ids[j]);
        if (path) {
          paths.push(path);
        }
      }
    });
    return paths.length > 0 ? paths : null;
  }

  function clipPolygon(shape, type, index) {
    var dividedShape = [],
        clipping = type == 'clip',
        erasing = type == 'erase';

    MapShaper.forEachPath(shape, function(ids) {
      var path;
      for (var i=0; i<ids.length; i++) {
        path = dividePath(ids[i]);

        if (path) {
          if (MapShaper.pathsAreIdentical(ids, path)) {
            var contained = index.pathIsEnclosed(path);
            if (clipping && contained || erasing && !contained) {
              dividedShape.push(path);
            }
            break;
          } else {
            dividedShape.push(path);
          }
        }
      }
    });
    return dividedShape.length === 0 ? null : dividedShape;
  }
};

MapShaper.divideArcs = function(layers, arcs) {
  var map = MapShaper.insertClippingPoints(arcs);
  // TODO: handle duplicate arcs

  // update arc ids in arc-based layers
  layers.forEach(function(lyr) {
    if (lyr.geometry_type == 'polyline' || lyr.geometry_type == 'polygon') {
      MapShaper.updateArcIds(lyr.shapes, map, arcs);
    }
  });
};

// @src either a file containing polygons or the name/id of a polygon layer
MapShaper.prepareClippingLayer = function(src, dataset) {
  var match = MapShaper.findMatchingLayers(dataset.layers, src),
      layers = dataset.layers,
      clipLyr;
  if (match.length > 1) {
    stop("[prepareClippingLayer()] Clipping source must be a single layer");
  } else if (match.length == 1) {
    clipLyr = match[0];
    layers = dataset.layers;
  } else {
    var clipData = api.importFile(src);
    dataset.arcs = MapShaper.mergeDatasets([dataset, clipData]).arcs;
    clipLyr = clipData.layers[0];
    layers = layers.concat(clipLyr);
  }
  MapShaper.divideArcs(layers, dataset.arcs);
  return clipLyr;
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
      // id2 = nodes.findMatchingArc(id2); //
      ids.push(id2);
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

// Assumes layers and arcs have been processed with divideArcs()
api.dividePolygonLayer = function(lyrA, lyrB, arcs) {
  if (lyrA.geometry_type != 'polygon') {
    stop("[dividePolygonLayer()] Expected polygon layer, received:", lyrA.geometry_type);
  }

  var flags = MapShaper.initDivideFlags(lyrA.shapes, lyrB.shapes, arcs);
  var divide = MapShaper.getPathSplitter(arcs, flags);
  var dividedShapes = lyrA.shapes.map(function(shape, i) {
    var dividedShape = [];

    MapShaper.forEachPath(shape, function(ids) {
      var path;
      for (var i=0; i<ids.length; i++) {
        path = divide(ids[i]);
        if (path) {
          dividedShape.push(path);
        }
      }
    });
    return dividedShape.length === 0 ? null : dividedShape;
  });

  return Utils.defaults({shapes: dividedShapes, data: null}, lyrA);
};
