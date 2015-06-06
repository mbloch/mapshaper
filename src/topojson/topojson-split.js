/* @requires mapshaper-common, topojson-import, topojson-arc-prune */

// not in use

// Divide a TopoJSON topology into multiple topologies, one for each
// named geometry object.
// Arcs are filtered and arc ids are reindexed as needed.
//
TopoJSON.splitTopology = function(topology) {
  var topologies = {};
  Object.keys(topology.objects).forEach(function(name) {
    var split = {
      arcs: topology.arcs,
      // bbox: obj.bbox || null,
      objects: {}
    };
    split.objects[name] = topology.objects[name];
    utils.defaults(split, topology);
    TopoJSON.pruneArcs(split);
    topologies[name] = split;
  });
  return topologies;
};
