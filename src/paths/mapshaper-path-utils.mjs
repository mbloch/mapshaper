
import { Bounds } from '../geom/mapshaper-bounds';
import { absArcId } from '../paths/mapshaper-arc-utils';
import { error } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import geom from '../geom/mapshaper-geom';

// Utility functions for working with ArcCollection and arrays of arc ids.

// Return average segment length (with simplification)
export function getAvgSegment(arcs) {
  var sum = 0;
  var count = arcs.forEachSegment(function(i, j, xx, yy) {
    var dx = xx[i] - xx[j],
        dy = yy[i] - yy[j];
    sum += Math.sqrt(dx * dx + dy * dy);
  });
  return sum / count || 0;
}

// Return average magnitudes of dx, dy (with simplification)
export function getAvgSegment2(arcs) {
  var dx = 0, dy = 0;
  var count = arcs.forEachSegment(function(i, j, xx, yy) {
    dx += Math.abs(xx[i] - xx[j]);
    dy += Math.abs(yy[i] - yy[j]);
  });
  return [dx / count || 0, dy / count || 0];
}

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

export function getDirectedArcPresenceTest(shapes, n) {
  var flags = new Uint8Array(n);
  forEachArcId(shapes, function(id) {
    var absId = absArcId(id);
    if (absId < n === false) error('index error');
    flags[absId] |= id < 0 ? 2 : 1;
  });
  return function(arcId) {
    var absId = absArcId(arcId);
    return arcId < 0 ? (flags[absId] & 2) == 2 : (flags[absId] & 1) == 1;
  };
}

export function getArcPresenceTest(shapes, arcs) {
  var counts = new Uint8Array(arcs.size());
  countArcsInShapes(shapes, counts);
  return function(id) {
    if (id < 0) id = ~id;
    return counts[id] > 0;
  };
}

// @counts A typed array for accumulating count of each abs arc id
//   (assume it won't overflow)
export function countArcsInShapes(shapes, counts) {
  traversePaths(shapes, null, function(obj) {
    var arcs = obj.arcs,
        id;
    for (var i=0; i<arcs.length; i++) {
      id = arcs[i];
      if (id < 0) id = ~id;
      counts[id]++;
    }
  });
}

export function getPathBounds(shapes, arcs) {
  var bounds = new Bounds();
  forEachArcId(shapes, function(id) {
    arcs.mergeArcBounds(id, bounds);
  });
  return bounds;
}

// Returns subset of shapes in @shapes that contain one or more arcs in @arcIds
export function findShapesByArcId(shapes, arcIds, numArcs) {
  var index = numArcs ? new Uint8Array(numArcs) : [],
      found = [];
  arcIds.forEach(function(id) {
    index[absArcId(id)] = 1;
  });
  shapes.forEach(function(shp, shpId) {
    var isHit = false;
    forEachArcId(shp || [], function(id) {
      isHit = isHit || index[absArcId(id)] == 1;
    });
    if (isHit) {
      found.push(shpId);
    }
  });
  return found;
}

export function reversePath(ids) {
  ids.reverse();
  for (var i=0, n=ids.length; i<n; i++) {
    ids[i] = ~ids[i];
  }
  return ids;
}

export function clampIntervalByPct(z, pct) {
  if (pct <= 0) z = Infinity;
  else if (pct >= 1) z = 0;
  return z;
}

// Return id of the vertex between @start and @end with the highest
// threshold that is less than @zlim, or -1 if none
//
export function findNextRemovableVertex(zz, zlim, start, end) {
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
}

// Visit each arc id in a path, shape or array of shapes
// Use non-undefined return values of callback @cb as replacements.
export function forEachArcId(arr, cb) {
  var item;
  for (var i=0; i<arr.length; i++) {
    item = arr[i];
    if (Array.isArray(item)) {
      forEachArcId(item, cb);
    } else if (utils.isInteger(item)) {
      var val = cb(item);
      if (val !== void 0) {
        arr[i] = val;
      }
    } else if (item) {
      error("Non-integer arc id in:", arr);
    }
  }
}

export function forEachSegmentInShape(shape, arcs, cb) {
  for (var i=0, n=shape ? shape.length : 0; i<n; i++) {
    forEachSegmentInPath(shape[i], arcs, cb);
  }
}

export function forEachSegmentInPath(ids, arcs, cb) {
  for (var i=0, n=ids.length; i<n; i++) {
    arcs.forEachArcSegment(ids[i], cb);
  }
}

export function traversePaths(shapes, cbArc, cbPart, cbShape) {
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
}

function arcHasLength(id, coords) {
  var iter = coords.getArcIter(id), x, y;
  if (iter.hasNext()) {
    x = iter.x;
    y = iter.y;
    while (iter.hasNext()) {
      if (iter.x != x || iter.y != y) return true;
    }
  }
  return false;
}

export function filterEmptyArcs(shape, coords) {
  if (!shape) return null;
  var shape2 = [];
  shape.forEach(function(ids) {
    var path = [];
    for (var i=0; i<ids.length; i++) {
      if (arcHasLength(ids[i], coords)) {
        path.push(ids[i]);
      }
    }
    if (path.length > 0) shape2.push(path);
  });
  return shape2.length > 0 ? shape2 : null;
}

// Return an array of information about each part/ring in a polygon or polyline shape
export function getPathMetadata(shape, arcs, type) {
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
}

export function quantizeArcs(arcs, quanta) {
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
}
