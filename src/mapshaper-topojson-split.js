/* @requires mapshaper-common, mapshaper-topojson-import */

// Divide a TopoJSON topology into multiple topologies, one for each
// named geometry object.
// Arcs are filtered and arc ids are reindexed as needed.
//
TopoJSON.splitTopology = function(topology) {
  var topologies = {};
  Utils.forEach(topology.objects, function(obj, name) {
    var split = {
      arcs: TopoJSON.extractGeometryObject(obj, topology.arcs),
      bbox: obj.bbox || null,
      objects: {}
    };
    split.objects[name] = obj;
    Opts.copyNewParams(split, topology);
    topologies[name] = split;
  });
  return topologies;
};

// Filter array of arcs to include only arcs referenced by geometry object @obj
// Returns: Filtered copy of @arcs array
// Side effect: arc ids in @obj are re-indexed to match filtered arcs.
//
TopoJSON.extractGeometryObject = function(obj, arcs) {
  if (!Utils.isArray(arcs)) {
    error("Usage: TopoJSON.extractObject(object, arcs)");
  }

  // Mark arcs that are present in this object
  var flags = new Uint8Array(arcs.length);
  TopoJSON.traverseGeometryObject(obj, function(arcId) {
    if (arcId < 0) arcId = ~arcId;
    flags[arcId] = 1;
  });

  // Create array for translating original arc ids to filtered arc arrays
  var arcMap = new Uint32Array(arcs.length),
      newId = 0;
  var filteredArcs = Utils.filter(arcs, function(coords, i) {
    if (flags[i] === 1) {
      arcMap[i] = newId++;
      return true;
    }
    return false;
  });

  // Re-index
  TopoJSON.reindexArcIds(obj, arcMap);
  return filteredArcs;
};

// @map is an array of new arc ids, indexed by original arc ids.
//
TopoJSON.reindexArcIds = function(obj, map) {
  TopoJSON.traverseGeometryObject(obj, function(arcId) {
    var rev = arcId < 0,
        idx = rev ? ~arcId : arcId,
        mappedId = map[idx];
    return rev ? ~mappedId : mappedId;
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
      val = cb(item);
      if (val !== void 0) {
        arr[i] = val;
      }
    }
  });
};
