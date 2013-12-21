/* @require mapshaper-shapes, mapshaper-shape-geom */

MapShaper.protectShapes = function(arcData, layers) {
  T.start();
  Utils.forEach(layers, function(lyr) {
    // TODO: test with polyline shapes
    MapShaper.protectLayerShapes(arcData, lyr.shapes);
  });
  T.stop("Protect shapes");
};

MapShaper.protectLayerShapes = function(arcData, shapes) {
  Utils.forEach(shapes, function(shape) {
    MapShaper.protectShape(arcData, shape);
  });
};

// Protect a single shape from complete removal by simplification
// @arcData an ArcDataset
// @shape an array containing one or more arrays of arc ids, or null if null shape
//
MapShaper.protectShape = function(arcData, shape) {
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
    trace("[protectShape()] Invalid shape:", shape);
  } else if (maxRing.length == 1) {
    MapShaper.protectIslandRing(arcData, maxRing);
  } else {
    MapShaper.protectMultiRing(arcData, maxRing);
  }
};

// Add two vertices to the ring to form a triangle.
// Assuming that this will inflate the ring.
// Consider using the function for multi-arc rings, which
//   calculates ring area...
MapShaper.protectIslandRing = function(arcData, ring) {
  var added = MapShaper.lockMaxThreshold(arcData, ring);
  if (added == 1) {
    added += MapShaper.lockMaxThreshold(arcData, ring);
  }
  if (added < 2) trace("[protectIslandRing()] Failed on ring:", ring);
};

MapShaper.protectMultiRing = function(arcData, ring) {
  var zlim = arcData.getRetainedInterval(),
      minArea = 0, // 0.00000001, // Need to handle rounding error?
      iter, area, added;
  arcData.setRetainedInterval(Infinity);
  iter = arcData.getShapeIter(ring);
  area = MapShaper.getPathArea(iter);
  while (area <= minArea) {
    added = MapShaper.lockMaxThreshold(arcData, ring);
    if (added === 0) {
      trace("protectMultiRing() Failed on ring:", ring);
      break;
    }
    iter.reset();
    area = MapShaper.getPathArea(iter);
  }
  arcData.setRetainedInterval(zlim);
};

// Protect the vertex or vertices with the largest non-infinite
// removal threshold in a ring.
//
MapShaper.lockMaxThreshold = function(arcData, ring) {
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
    id = MapShaper.findNextRemovableVertex(raw.zz, Infinity, start, end);
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
    return MapShaper.replaceValue(raw.zz, targZ, Infinity, start, end);
  }
  return 0;
};

MapShaper.replaceValue = function(zz, value, replacement, start, end) {
  var count = 0;
  for (var i=start; i<=end; i++) {
    if (zz[i] === value) {
      zz[i] = replacement;
      count++;
    }
  }
  return count;
};
