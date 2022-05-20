import { findNextRemovableVertex } from '../paths/mapshaper-path-utils';
import { verbose } from '../utils/mapshaper-logging';
import geom from '../geom/mapshaper-geom';

export function keepEveryPolygon(arcData, layers) {
  layers.forEach(function(lyr) {
    if (lyr.geometry_type == 'polygon') {
      protectLayerShapes(arcData, lyr.shapes);
    }
  });
}

function protectLayerShapes(arcData, shapes) {
  shapes.forEach(function(shape) {
    protectShape(arcData, shape);
  });
}

// Protect a single shape from complete removal by simplification
// @arcData an ArcCollection
// @shape an array containing one or more arrays of arc ids, or null if null shape
//
export function protectShape(arcData, shape) {
  var maxArea = 0,
      arcCount = shape ? shape.length : 0,
      maxRing, area;
  // Find ring with largest bounding box
  for (var i=0; i<arcCount; i++) {
    area = arcData.getSimpleShapeBounds(shape[i]).area();
    if (area > maxArea) {
      maxRing = shape[i];
      maxArea = area;
    }
  }

  if (!maxRing || maxRing.length === 0) {
    // invald shape
    verbose("[protectShape()] Invalid shape:", shape);
  } else {
    protectPolygonRing(arcData, maxRing);
  }
}

// Re-inflate a polygon ring that has collapsed due to simplification by
//   adding points in reverse order of removal until polygon is inflated.
function protectPolygonRing(arcData, ring) {
  var zlim = arcData.getRetainedInterval(),
      // use epsilon as min area instead of 0, in case f.p. rounding produces
      // a positive area for a collapsed polygon.
      minArea = 1e-10,
      area, added;
  arcData.setRetainedInterval(Infinity);
  area = geom.getPlanarPathArea(ring, arcData);
  while (area <= minArea) {
    added = lockMaxThreshold(arcData, ring);
    if (added === 0) {
      verbose("[protectMultiRing()] Failed on ring:", ring);
      break;
    }
    area = geom.getPlanarPathArea(ring, arcData);
  }
  arcData.setRetainedInterval(zlim);
}

// Protect the vertex or vertices with the largest non-infinite
// removal threshold in a ring.
//
function lockMaxThreshold(arcData, ring) {
  var targZ = 0,
      targArcId,
      raw = arcData.getVertexData(),
      arcId, id, z,
      start, end;

  for (var i=0; i<ring.length; i++) {
    arcId = ring[i];
    if (arcId < 0) arcId = ~arcId;
    start = raw.ii[arcId];
    end = start + raw.nn[arcId] - 1;
    id = findNextRemovableVertex(raw.zz, Infinity, start, end);
    if (id == -1) continue;
    z = raw.zz[id];
    if (z > targZ) {
      targZ = z;
      targArcId = arcId;
    }
  }
  if (targZ > 0) {
    // There may be more than one vertex with the target Z value; lock them all.
    start = raw.ii[targArcId];
    end = start + raw.nn[targArcId] - 1;
    return replaceInArray(raw.zz, targZ, Infinity, start, end);
  }
  return 0;
}

export function replaceInArray(zz, value, replacement, start, end) {
  var count = 0;
  for (var i=start; i<=end; i++) {
    if (zz[i] === value) {
      zz[i] = replacement;
      count++;
    }
  }
  return count;
}
