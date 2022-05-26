import { pruneArcs } from '../dataset/mapshaper-dataset-utils';
import utils from '../utils/mapshaper-utils';

// not in use

// Divide a TopoJSON topology into multiple topologies, one for each
// named geometry object.
// Arcs are filtered and arc ids are reindexed as needed.

export function splitTopology(topology) {
  var topologies = {};
  Object.keys(topology.objects).forEach(function(name) {
    var split = {
      arcs: topology.arcs,
      // bbox: obj.bbox || null,
      objects: {}
    };
    split.objects[name] = topology.objects[name];
    utils.defaults(split, topology);
    pruneArcs(split);
    topologies[name] = split;
  });
  return topologies;
}
