/* @requires mapshaper-arcs mapshaper-point-utils */

// Utility functions for working with ArcCollection and arrays of arc ids.


// Return average segment length (with simplification)
internal.getAvgSegment = function(arcs) {
  var sum = 0;
  var count = arcs.forEachSegment(function(i, j, xx, yy) {
    var dx = xx[i] - xx[j],
        dy = yy[i] - yy[j];
    sum += Math.sqrt(dx * dx + dy * dy);
  });
  return sum / count || 0;
};

// Return average magnitudes of dx, dy (with simplification)
internal.getAvgSegment2 = function(arcs) {
  var dx = 0, dy = 0;
  var count = arcs.forEachSegment(function(i, j, xx, yy) {
    dx += Math.abs(xx[i] - xx[j]);
    dy += Math.abs(yy[i] - yy[j]);
  });
  return [dx / count || 0, dy / count || 0];
};

internal.getDirectedArcPresenceTest = function(shapes, n) {
  var flags = new Uint8Array(n);
  internal.forEachArcId(shapes, function(id) {
    var absId = absArcId(id);
    if (absId < n === false) error('index error');
    flags[absId] |= id < 0 ? 2 : 1;
  });
  return function(arcId) {
    var absId = absArcId(arcId);
    return arcId < 0 ? (flags[absId] & 2) == 2 : (flags[absId] & 1) == 1;
  };
};

internal.getArcPresenceTest = function(shapes, n) {
  var counts = new Uint8Array(n);
  internal.countArcsInShapes(shapes, counts);
  return function(id) {
    if (id < 0) id = ~id;
    return counts[id] > 0;
  };
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
internal.countArcsInShapes = function(shapes, counts) {
  internal.traversePaths(shapes, null, function(obj) {
    var arcs = obj.arcs,
        id;
    for (var i=0; i<arcs.length; i++) {
      id = arcs[i];
      if (id < 0) id = ~id;
      counts[id]++;
    }
  });
};

// Count arcs in a collection of layers
internal.countArcReferences = function(layers, arcs) {
  var counts = new Uint32Array(arcs.size());
  layers.forEach(function(lyr) {
    internal.countArcsInShapes(lyr.shapes, counts);
  });
  return counts;
};


// Returns subset of shapes in @shapes that contain one or more arcs in @arcIds
internal.findShapesByArcId = function(shapes, arcIds, numArcs) {
  var index = numArcs ? new Uint8Array(numArcs) : [],
      found = [];
  arcIds.forEach(function(id) {
    index[absArcId(id)] = 1;
  });
  shapes.forEach(function(shp, shpId) {
    var isHit = false;
    internal.forEachArcId(shp || [], function(id) {
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
internal.cloneShape = function(shp) {
  if (!shp) return null;
  return shp.map(function(part) {
    return part.concat();
  });
};

internal.cloneShapes = function(arr) {
  return utils.isArray(arr) ? arr.map(internal.cloneShape) : null;
};

// a and b are arrays of arc ids
internal.pathsAreIdentical = function(a, b) {
  if (a.length != b.length) return false;
  for (var i=0, n=a.length; i<n; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
};

internal.reversePath = function(ids) {
  ids.reverse();
  for (var i=0, n=ids.length; i<n; i++) {
    ids[i] = ~ids[i];
  }
};

internal.clampIntervalByPct = function(z, pct) {
  if (pct <= 0) z = Infinity;
  else if (pct >= 1) z = 0;
  return z;
};

internal.findNextRemovableVertices = function(zz, zlim, start, end) {
  var i = internal.findNextRemovableVertex(zz, zlim, start, end),
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
internal.findNextRemovableVertex = function(zz, zlim, start, end) {
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
internal.forEachArcId = function(arr, cb) {
  var item;
  for (var i=0; i<arr.length; i++) {
    item = arr[i];
    if (item instanceof Array) {
      internal.forEachArcId(item, cb);
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

internal.forEachPath = function(paths, cb) {
  internal.editPaths(paths, cb);
};

internal.editShapes = function(shapes, editPath) {
  for (var i=0, n=shapes.length; i<n; i++) {
    shapes[i] = internal.editPaths(shapes[i], editPath);
  }
};

// @paths: geometry of a feature (array of paths or null)
// @cb: function(path, i, paths)
//    If @cb returns an array, it replaces the existing value
//    If @cb returns null, the path is removed from the feature
//
internal.editPaths = function(paths, cb) {
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

internal.forEachSegmentInShape = function(shape, arcs, cb) {
  for (var i=0, n=shape ? shape.length : 0; i<n; i++) {
    internal.forEachSegmentInPath(shape[i], arcs, cb);
  }
};

internal.forEachSegmentInPath = function(ids, arcs, cb) {
  for (var i=0, n=ids.length; i<n; i++) {
    arcs.forEachArcSegment(ids[i], cb);
  }
};

internal.traversePaths = function traversePaths(shapes, cbArc, cbPart, cbShape) {
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

internal.arcHasLength = function(id, coords) {
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

internal.filterEmptyArcs = function(shape, coords) {
  if (!shape) return null;
  var shape2 = [];
  shape.forEach(function(ids) {
    var path = [];
    for (var i=0; i<ids.length; i++) {
      if (internal.arcHasLength(ids[i], coords)) {
        path.push(ids[i]);
      }
    }
    if (path.length > 0) shape2.push(path);
  });
  return shape2.length > 0 ? shape2 : null;
};

// Bundle holes with their containing rings for Topo/GeoJSON polygon export.
// Assumes outer rings are CW and inner (hole) rings are CCW.
// @paths array of objects with path metadata -- see internal.exportPathData()
//
// TODO: Improve reliability. Currently uses winding order, area and bbox to
//   identify holes and their enclosures -- could be confused by strange
//   geometry.
//
internal.groupPolygonRings = function(paths, reverseWinding) {
  var pos = [],
      neg = [],
      sign = reverseWinding ? -1 : 1;
  if (paths) {
    paths.forEach(function(path) {
      if (path.area * sign > 0) {
        pos.push(path);
      } else if (path.area * sign < 0) {
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
        containerArea = 0,
        holeArea = hole.area * -sign;
    for (var i=0, n=pos.length; i<n; i++) {
      var part = pos[i],
          partArea = part.area * sign,
          contained = part.bounds.contains(hole.bounds) && partArea > holeArea;
      if (contained && (containerArea === 0 || partArea < containerArea)) {
        containerArea = partArea;
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

internal.getPathMetadata = function(shape, arcs, type) {
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

internal.quantizeArcs = function(arcs, quanta) {
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



