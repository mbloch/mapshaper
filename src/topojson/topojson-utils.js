
var TopoJSON = {};

TopoJSON.traverseGeometryObject = function(obj, cb) {
  if (obj.arcs) {
    TopoJSON.traverseArcs(obj.arcs, cb);
  } else if (obj.geometries) {
    Utils.forEach(obj.geometries, function(geom) {
      TopoJSON.traverseGeometryObject(geom, cb);
    });
  }
};

// Visit each arc id in the arcs array of a geometry object.
// Use non-undefined return values of callback @cb as replacements.
//
TopoJSON.traverseArcs = function(arr, cb) {
  Utils.forEach(arr, function(item, i) {
    var val;
    if (item instanceof Array) {
      TopoJSON.traverseArcs(item, cb);
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

// Convert an array of 0s and 1s into an array of fwd arc ids
TopoJSON.getArcMap = function(mask) {
  var n = mask.length,
      count = 0,
      map = new Uint32Array(n);
  for (var i=0; i<n; i++) {
    map[i] = mask[i] === 0 ? -1 : count++;
  }
  return map;
};





// @map is an array of replacement arc ids, indexed by original arc id
// @obj is any TopoJSON Geometry object (including named objects, GeometryCollections, Polygons, etc)
TopoJSON.reindexArcIds = function(obj, map) {
  TopoJSON.traverseGeometryObject(obj, function(arcId) {
    var rev = arcId < 0,
        idx = rev ? ~arcId : arcId,
        mappedId = map[idx];
    return rev ? ~mappedId : mappedId;
  });
};
