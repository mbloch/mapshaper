/* @requires mapshaper-shapes */

// Utility functions for working with ArcDatasets and arrays of arc ids.

MapShaper.clampIntervalByPct = function(z, pct) {
  if (pct <= 0) z = Infinity;
  else if (pct >= 1) z = 0;
  return z;
};

// Return id of the vertex between @start and @end with the highest
// threshold that is less than @zlim.
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

/*
// TODO: look into removing redundancy with TopoJSON.traverseArcs() in topojson-utils.js
MapShaper.traverseArcs = function(shapes, cb) {
  MapShaper.traverseShapes(shapes, function(obj) {
    cb(obj.arcId);
  });
};
*/

// Visit each arc id in an array of ids
// Use non-undefined return values of callback @cb as replacements.
MapShaper.updateArcIds = function(arr, cb) {
  Utils.forEach(arr, function(item, i) {
    var val;
    if (item instanceof Array) {
      MapShaper.updateArcIds(item, cb);
    } else {
      if (!Utils.isInteger(item)) {
        throw new Error("Non-integer arc id in:", arr);
      }
      val = cb(item);
      if (val !== void 0) {
        arr[i] = val;
      }
    }
  });
};

MapShaper.traverseShapes = function traverseShapes(shapes, cbArc, cbPart, cbShape) {
  var segId = 0;
  Utils.forEach(shapes, function(parts, shapeId) {
    if (!parts || parts.length === 0) return; // null shape
    var arcIds, arcId, partData;
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
