/* @requires mapshaper-arcs */

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

internal.getArcPresenceTest = function(shapes, arcs) {
  var counts = new Uint8Array(arcs.size());
  internal.countArcsInShapes(shapes, counts);
  return function(id) {
    if (id < 0) id = ~id;
    return counts[id] > 0;
  };
};

internal.getArcPresenceTest2 = function(layers, arcs) {
  var counts = internal.countArcsInLayers(layers, arcs);
  return function(arcId) {
    return counts[absArcId(arcId)] > 0;
  };
};

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
internal.countArcsInLayers = function(layers, arcs) {
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
  if (!paths || paths.length == 0) {
    return [];
  }

  var pos = [],
      neg = [],
      sign = reverseWinding ? -1 : 1;

  paths.forEach(function(path) {
    if (path.area * sign > 0) {
      pos.push({part: path, idx: pos.length});
    } else if (path.area * sign < 0) {
      neg.push({
        minX: path.bounds.xmin,
        minY: path.bounds.ymin,
        maxX: path.bounds.xmax,
        maxY: path.bounds.ymax,
        hole: path
      });
    } else {
      // verbose("Zero-area ring, skipping");
    }
  });

  if (pos.length == 0) {
    return [];
  }

  var output = pos.map(function(elemp) {
    return [elemp.part];
  });

  if (neg.length == 0) {
    return output;
  }

  pos.sort(function(a, b) { return a.part.area * sign - b.part.area * sign});

  var tree = require('rbush')();
  tree.load(neg);

  for(var i=0, n=pos.length; i<n; i++) {
    var part = pos[i].part,
        containerId = pos[i].idx,
        partArea = part.area * sign;

    var contained = tree.search({
      minX: part.bounds.xmin,
      minY: part.bounds.ymin,
      maxX: part.bounds.xmax,
      maxY: part.bounds.ymax
    });

    contained.forEach(function(elemn) {
      var hole = elemn.hole,
        holeArea = hole.area * -sign;
      if (partArea > holeArea && part.bounds.contains(hole.bounds)) {
        output[containerId].push(hole);
        tree.remove(elemn);
      }
    });
  }

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
