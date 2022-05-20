import { error } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

// Utility functions for both paths and points

// @shp An element of the layer.shapes array
//   (may be null, or, depending on layer type, an array of points or an array of arrays of arc ids)
export function cloneShape(shp) {
  if (!shp) return null;
  return shp.map(function(part) {
    return part.concat();
  });
}

export function cloneShapes(arr) {
  return utils.isArray(arr) ? arr.map(cloneShape) : null;
}

export function forEachShapePart(paths, cb) {
  editShapeParts(paths, cb);
}

// Updates shapes array in-place.
// editPart: callback function
export function editShapes(shapes, editPart) {
  for (var i=0, n=shapes.length; i<n; i++) {
    shapes[i] = editShapeParts(shapes[i], editPart);
  }
}

// @parts: geometry of a feature (array of paths, array of points or null)
// @cb: function(part, i, parts)
//    If @cb returns an array, it replaces the existing value
//    If @cb returns null, the path is removed from the feature
//
export function editShapeParts(parts, cb) {
  if (!parts) return null; // null geometry not edited
  if (!utils.isArray(parts)) error("Expected an array, received:", parts);
  var nulls = 0,
      n = parts.length,
      retn;

  for (var i=0; i<n; i++) {
    retn = cb(parts[i], i, parts);
    if (retn === null) {
      nulls++;
      parts[i] = null;
    } else if (utils.isArray(retn)) {
      parts[i] = retn;
    }
  }
  if (nulls == n) {
    return null;
  } else if (nulls > 0) {
    return parts.filter(function(part) {return !!part;});
  } else {
    return parts;
  }
}

// Get max number of parts in a single shape from an array of shapes.
// Caveat: polygon holes are counted as separate parts.
export function findMaxPartCount(shapes) {
  var maxCount = 0, shp;
  for (var i=0, n=shapes.length; i<n; i++) {
    shp = shapes[i];
    if (shp && shp.length > maxCount) {
      maxCount = shp.length;
    }
  }
  return maxCount;
}
