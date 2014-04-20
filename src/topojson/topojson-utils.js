
var TopoJSON = {};

// remove arcs that are not referenced or have collapsed
// update ids of the remaining arcs
TopoJSON.pruneArcs = function(topology) {
  var arcs = topology.arcs;
  var flags = new Uint8Array(arcs.length);
  Utils.forEach(topology.objects, function(obj, name) {
    TopoJSON.traverseGeometryObject(obj, function(arcId) {
      if (arcId < 0) arcId = ~arcId;
      flags[arcId] = 1;
    });
  });

  topology.arcs = Utils.filter(arcs, function(coords, i) {
    return flags[i] === 1;
  });

  // Re-index
  var arcMap = TopoJSON.getArcMap(flags);
  Utils.forEach(topology.objects, function(obj) {
    TopoJSON.reindexArcIds(obj, arcMap);
  });
};

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

// Convert an array of flags (0|1) into an array of non-negative arc ids
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
    if (mappedId < 0) { // -1 in arc map indicates arc has been removed
      error("reindexArcIds() invalid arc id");
    }
    return rev ? ~mappedId : mappedId;
  });
};
