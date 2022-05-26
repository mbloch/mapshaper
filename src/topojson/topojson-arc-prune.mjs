// This file is not currently being used
import TopoJSON from '../topojson/topojson-common';
import utils from '../utils/mapshaper-utils';
import { error } from '../utils/mapshaper-logging';

// remove arcs that are not referenced or have collapsed
// update ids of the remaining arcs
export function pruneArcs(topology) {
  var arcs = topology.arcs;
  var retained = new Uint32Array(arcs.length);

  utils.forEachProperty(topology.objects, function(obj) {
    TopoJSON.forEachArc(obj, function(arcId) {
      // TODO: skip collapsed arcs
      if (arcId < 0) arcId = ~arcId;
      retained[arcId] = 1;
    });
  });

  if (utils.sum(retained) < arcs.length) {
    // filter arcs and remap ids
    topology.arcs = arcs.reduce(function(arcs, arc, i) {
      if (arc && retained[i] === 1) { // dissolved-away arcs are set to null
        retained[i] = arcs.length;
        arcs.push(arc);
      } else {
        retained[i] = -1;
      }
      return arcs;
    }, []);

    // Re-index
    utils.forEachProperty(topology.objects, function(obj) {
      reindexArcIds(obj, retained);
    });
  }
}

// @map is an array of replacement arc ids, indexed by original arc id
// @geom is a TopoJSON Geometry object (including GeometryCollections, Polygons, etc)
function reindexArcIds(geom, map) {
  TopoJSON.forEachArc(geom, function(id) {
    var rev = id < 0,
        idx = rev ? ~id : id,
        replacement = map[idx];
    if (replacement < 0) { // -1 in arc map indicates arc has been removed
      error("[reindexArcIds()] invalid arc id");
    }
    return rev ? ~replacement : replacement;
  });
}
