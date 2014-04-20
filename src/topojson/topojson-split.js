/* @requires mapshaper-common, topojson-import, topojson-utils */

// Divide a TopoJSON topology into multiple topologies, one for each
// named geometry object.
// Arcs are filtered and arc ids are reindexed as needed.
//
TopoJSON.splitTopology = function(topology) {
  var topologies = {};
  Utils.forEach(topology.objects, function(obj, name) {
    var split = {
      arcs: topology.arcs,
      // bbox: obj.bbox || null,
      objects: {}
    };
    split.objects[name] = obj;
    Opts.copyNewParams(split, topology);
    TopoJSON.pruneArcs(split);
    topologies[name] = split;
  });
  return topologies;
};

/*
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
*/
