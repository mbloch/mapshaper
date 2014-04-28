
var TopoJSON = {};

// remove arcs that are not referenced or have collapsed
// update ids of the remaining arcs
TopoJSON.pruneArcs = function(topology) {
  var arcs = topology.arcs;
  var flags = new Uint8Array(arcs.length);
  Utils.forEach(topology.objects, function(obj, name) {
    TopoJSON.updateArcIds(obj, function(arcId) {
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

// Update each arc id in a TopoJSON geometry object
TopoJSON.updateArcIds = function(obj, cb) {
  if (obj.arcs) {
    utils.updateArcIds(obj.arcs, cb);
  } else if (obj.geometries) {
    Utils.forEach(obj.geometries, function(geom) {
      TopoJSON.updateArcIds(geom, cb);
    });
  }
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
  TopoJSON.updateArcIds(obj, function(arcId) {
    var rev = arcId < 0,
        idx = rev ? ~arcId : arcId,
        mappedId = map[idx];
    if (mappedId < 0) { // -1 in arc map indicates arc has been removed
      error("reindexArcIds() invalid arc id");
    }
    return rev ? ~mappedId : mappedId;
  });
};
