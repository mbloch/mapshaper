/* @require topojson-common, topojson-arc-dissolve */

// remove arcs that are not referenced or have collapsed
// update ids of the remaining arcs
TopoJSON.pruneArcs = function(topology) {
  var arcs = topology.arcs;
  var retained = new Uint32Array(arcs.length);

  Utils.forEach(topology.objects, function(obj, name) {
    TopoJSON.forEachArc(obj, function(arcId) {
      if (arcId < 0) arcId = ~arcId;
      retained[arcId] = 1;
    });
  });

  var filterCount = Utils.reduce(retained, function(count, flag) {
    return count + flag;
  }, 0);

  if (filterCount < arcs.length) {
    // buggy
    // TopoJSON.dissolveArcs(topology);

    // filter arcs and remap ids
    topology.arcs = Utils.reduce(arcs, function(arcs, arc, i) {
      if (arc && retained[i] === 1) { // dissolved-away arcs are set to null
        retained[i] = arcs.length;
        arcs.push(arc);
      } else {
        retained[i] = -1;
      }
      return arcs;
    }, []);

    // Re-index
    Utils.forEach(topology.objects, function(obj) {
      TopoJSON.reindexArcIds(obj, retained);
    });
  }
};

// @map is an array of replacement arc ids, indexed by original arc id
// @geom is a TopoJSON Geometry object (including GeometryCollections, Polygons, etc)
TopoJSON.reindexArcIds = function(geom, map) {
  TopoJSON.forEachArc(geom, function(id) {
    var rev = id < 0,
        idx = rev ? ~id : id,
        replacement = map[idx];
    if (replacement < 0) { // -1 in arc map indicates arc has been removed
      error("[reindexArcIds()] invalid arc id");
    }
    return rev ? ~replacement : replacement;
  });
};
