/* @requires mapshaper-arcs mapshaper-point-utils */

// Utility functions for working with ArcCollection and arrays of arc ids.


// Return average segment length (with simplification)
MapShaper.getAvgSegment = function(arcs) {
  var sum = 0;
  var count = arcs.forEachSegment(function(i, j, xx, yy) {
    var dx = xx[i] - xx[j],
        dy = yy[i] - yy[j];
    sum += Math.sqrt(dx * dx + dy * dy);
  });
  return sum / count || 0;
};

// Return average magnitudes of dx, dy (with simplification)
MapShaper.getAvgSegment2 = function(arcs) {
  var dx = 0, dy = 0;
  var count = arcs.forEachSegment(function(i, j, xx, yy) {
    dx += Math.abs(xx[i] - xx[j]);
    dy += Math.abs(yy[i] - yy[j]);
  });
  return [dx / count || 0, dy / count || 0];
};


// Return average magnitudes of dx, dy (with simplification)
/*
this.getAvgSegmentSph2 = function() {
  var sumx = 0, sumy = 0;
  var count = this.forEachSegment(function(i, j, xx, yy) {
    var lat1 = yy[i],
        lat2 = yy[j];
    sumy += geom.degreesToMeters(Math.abs(lat1 - lat2));
    sumx += geom.degreesToMeters(Math.abs(xx[i] - xx[j]) *
        Math.cos((lat1 + lat2) * 0.5 * geom.D2R);
  });
  return [sumx / count || 0, sumy / count || 0];
};
*/


// @counts A typed array for accumulating count of each abs arc id
//   (assume it won't overflow)
MapShaper.countArcsInShapes = function(shapes, counts) {
  MapShaper.traversePaths(shapes, null, function(obj) {
    var arcs = obj.arcs,
        id;
    for (var i=0; i<arcs.length; i++) {
      id = arcs[i];
      if (id < 0) id = ~id;
      counts[id]++;
    }
  });
};

// Returns subset of shapes in @shapes that contain one or more arcs in @arcIds
MapShaper.findShapesByArcId = function(shapes, arcIds, numArcs) {
  var index = numArcs ? new Uint8Array(numArcs) : [],
      found = [];
  arcIds.forEach(function(id) {
    index[absArcId(id)] = 1;
  });
  shapes.forEach(function(shp, shpId) {
    var isHit = false;
    MapShaper.forEachArcId(shp || [], function(id) {
      isHit = isHit || index[absArcId(id)] == 1;
    });
    if (isHit) {
      found.push(shpId);
    }
  });
  return found;
};

// @shp An element of the layer.shapes array
//   (may be null, or, depending on layer type, an array of points or an array of arrays of arc ids)
MapShaper.cloneShape = function(shp) {
  if (!shp) return null;
  return shp.map(function(part) {
    return part.concat();
  });
};

MapShaper.cloneShapes = function(arr) {
  return utils.isArray(arr) ? arr.map(MapShaper.cloneShape) : null;
};

// a and b are arrays of arc ids
MapShaper.pathsAreIdentical = function(a, b) {
  if (a.length != b.length) return false;
  for (var i=0, n=a.length; i<n; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
};

MapShaper.reversePath = function(ids) {
  ids.reverse();
  for (var i=0, n=ids.length; i<n; i++) {
    ids[i] = ~ids[i];
  }
};

MapShaper.clampIntervalByPct = function(z, pct) {
  if (pct <= 0) z = Infinity;
  else if (pct >= 1) z = 0;
  return z;
};

MapShaper.findNextRemovableVertices = function(zz, zlim, start, end) {
  var i = MapShaper.findNextRemovableVertex(zz, zlim, start, end),
      arr, k;
  if (i > -1) {
    k = zz[i];
    arr = [i];
    while (++i < end) {
      if (zz[i] == k) {
        arr.push(i);
      }
    }
  }
  return arr || null;
};

// Return id of the vertex between @start and @end with the highest
// threshold that is less than @zlim, or -1 if none
//
MapShaper.findNextRemovableVertex = function(zz, zlim, start, end) {
  var tmp, jz = 0, j = -1, z;
  if (start > end) {
    tmp = start;
    start = end;
    end = tmp;
  }
  for (var i=start+1; i<end; i++) {
    z = zz[i];
    if (z < zlim && z > jz) {
      j = i;
      jz = z;
    }
  }
  return j;
};

// Visit each arc id in a path, shape or array of shapes
// Use non-undefined return values of callback @cb as replacements.
MapShaper.forEachArcId = function(arr, cb) {
  var item;
  for (var i=0; i<arr.length; i++) {
    item = arr[i];
    if (item instanceof Array) {
      MapShaper.forEachArcId(item, cb);
    } else if (utils.isInteger(item)) {
      var val = cb(item);
      if (val !== void 0) {
        arr[i] = val;
      }
    } else if (item) {
      error("Non-integer arc id in:", arr);
    }
  }
};

MapShaper.forEachPath = function(paths, cb) {
  MapShaper.editPaths(paths, cb);
};

MapShaper.editShapes = function(shapes, editPath) {
  for (var i=0, n=shapes.length; i<n; i++) {
    shapes[i] = MapShaper.editPaths(shapes[i], editPath);
  }
};

// @paths: geometry of a feature (array of paths or null)
// @cb: function(path, i, paths)
//    If @cb returns an array, it replaces the existing value
//    If @cb returns null, the path is removed from the feature
//
MapShaper.editPaths = function(paths, cb) {
  if (!paths) return null; // null shape
  if (!utils.isArray(paths)) error("[editPaths()] Expected an array, found:", arr);
  var nulls = 0,
      n = paths.length,
      retn;

  for (var i=0; i<n; i++) {
    retn = cb(paths[i], i, paths);
    if (retn === null) {
      nulls++;
      paths[i] = null;
    } else if (utils.isArray(retn)) {
      paths[i] = retn;
    }
  }
  if (nulls == n) {
    return null;
  } else if (nulls > 0) {
    return paths.filter(function(ids) {return !!ids;});
  } else {
    return paths;
  }
};

MapShaper.forEachPathSegment = function(shape, arcs, cb) {
  MapShaper.forEachArcId(shape, function(arcId) {
    arcs.forEachArcSegment(arcId, cb);
  });
};

MapShaper.traversePaths = function traversePaths(shapes, cbArc, cbPart, cbShape) {
  var segId = 0;
  shapes.forEach(function(parts, shapeId) {
    if (!parts || parts.length === 0) return; // null shape
    var arcIds, arcId;
    if (cbShape) {
      cbShape(shapeId);
    }
    for (var i=0, m=parts.length; i<m; i++) {
      arcIds = parts[i];
      if (cbPart) {
        cbPart({
          i: i,
          shapeId: shapeId,
          shape: parts,
          arcs: arcIds
        });
      }

      if (cbArc) {
        for (var j=0, n=arcIds.length; j<n; j++, segId++) {
          arcId = arcIds[j];
          cbArc({
            i: j,
            shapeId: shapeId,
            partId: i,
            arcId: arcId,
            segId: segId
          });
        }
      }
    }
  });
};

MapShaper.arcHasLength = function(id, coords) {
  var iter = coords.getArcIter(id), x, y;
  if (iter.hasNext()) {
    x = iter.x;
    y = iter.y;
    while (iter.hasNext()) {
      if (iter.x != x || iter.y != y) return true;
    }
  }
  return false;
};

MapShaper.filterEmptyArcs = function(shape, coords) {
  if (!shape) return null;
  var shape2 = [];
  shape.forEach(function(ids) {
    var path = [];
    for (var i=0; i<ids.length; i++) {
      if (MapShaper.arcHasLength(ids[i], coords)) {
        path.push(ids[i]);
      }
    }
    if (path.length > 0) shape2.push(path);
  });
  return shape2.length > 0 ? shape2 : null;
};

// Bundle holes with their containing rings for Topo/GeoJSON polygon export.
// Assumes outer rings are CW and inner (hole) rings are CCW.
// @paths array of objects with path metadata -- see MapShaper.exportPathData()
//
// TODO: Improve reliability. Currently uses winding order, area and bbox to
//   identify holes and their enclosures -- could be confused by strange
//   geometry.
//
MapShaper.groupPolygonRings = function(paths) {
  var pos = [],
      neg = [];
  if (paths) {
    paths.forEach(function(path) {
      if (path.area > 0) {
        pos.push(path);
      } else if (path.area < 0) {
        neg.push(path);
      } else {
        // verbose("Zero-area ring, skipping");
      }
    });
  }

  var output = pos.map(function(part) {
    return [part];
  });

  neg.forEach(function(hole) {
    var containerId = -1,
        containerArea = 0;
    for (var i=0, n=pos.length; i<n; i++) {
      var part = pos[i],
          contained = part.bounds.contains(hole.bounds) && part.area > -hole.area;
      if (contained && (containerArea === 0 || part.area < containerArea)) {
        containerArea = part.area;
        containerId = i;
      }
    }
    if (containerId == -1) {
      verbose("[groupPolygonRings()] polygon hole is missing a containing ring, dropping.");
    } else {
      output[containerId].push(hole);
    }
  });
  return output;
};

MapShaper.getPathMetadata = function(shape, arcs, type) {
  var data = [],
      ids;
  for (var i=0, n=shape && shape.length; i<n; i++) {
    ids = shape[i];
    data.push({
      ids: ids,
      area: type == 'polygon' ? geom.getPlanarPathArea(ids, arcs) : 0,
      bounds: arcs.getSimpleShapeBounds(ids)
    });
  }
  return data;
};

MapShaper.quantizeArcs = function(arcs, quanta) {
  // Snap coordinates to a grid of @quanta locations on both axes
  // This may snap nearby points to the same coordinates.
  // Consider a cleanup pass to remove dupes, make sure collapsed arcs are
  //   removed on export.
  //
  var bb1 = arcs.getBounds(),
      bb2 = new Bounds(0, 0, quanta-1, quanta-1),
      fw = bb1.getTransform(bb2),
      inv = fw.invert();

  arcs.transformPoints(function(x, y) {
    var p = fw.transform(x, y);
    return inv.transform(Math.round(p[0]), Math.round(p[1]));
  });
};
