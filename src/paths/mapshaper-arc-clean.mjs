import { getArcPresenceTest2 } from '../dataset/mapshaper-layer-utils';
import { NodeCollection } from '../topology/mapshaper-nodes';
import { layerHasPaths } from '../dataset/mapshaper-layer-utils';
import { editShapes } from '../paths/mapshaper-shape-utils';
import { absArcId } from '../paths/mapshaper-arc-utils';
import { profileStart, profileEnd } from '../utils/mapshaper-profile';


// Remap any references to duplicate arcs in paths to use the same arcs
// Remove any unused arcs from the dataset's ArcCollection.
// Return a NodeCollection
export function cleanArcReferences(dataset) {
  profileStart('NodeCollection#1');
  var nodes = new NodeCollection(dataset.arcs);
  profileEnd('NodeCollection#1');
  profileStart('findDuplicateArcs');
  var map = findDuplicateArcs(nodes);
  profileEnd('findDuplicateArcs');
  var dropCount;
  if (map) {
    profileStart('replaceIndexedArcIds');
    replaceIndexedArcIds(dataset, map);
    profileEnd('replaceIndexedArcIds');
  }
  profileStart('deleteUnusedArcs');
  dropCount = deleteUnusedArcs(dataset);
  profileEnd('deleteUnusedArcs');
  if (dropCount > 0) {
    // rebuild nodes if arcs have changed
    profileStart('NodeCollection#2');
    nodes = new NodeCollection(dataset.arcs);
    profileEnd('NodeCollection#2');
  }
  return nodes;
}

export function deleteUnusedArcs(dataset) {
  var test = getArcPresenceTest2(dataset.layers, dataset.arcs);
  var count1 = dataset.arcs.size();
  var map = dataset.arcs.deleteArcs(test); // condenses arcs
  var count2 = dataset.arcs.size();
  var deleteCount = count1 - count2;
  if (deleteCount > 0) {
    replaceIndexedArcIds(dataset, map);
  }
  return deleteCount;
}

// @map an Object mapping old to new ids
function replaceIndexedArcIds(dataset, map) {
  var remapPath = function(ids) {
    var arcId, absId, id2;
    for (var i=0; i<ids.length; i++) {
      arcId = ids[i];
      absId = absArcId(arcId);
      id2 = map[absId];
      ids[i] = arcId == absId ? id2 : ~id2;
    }
    return ids;
  };
  dataset.layers.forEach(function(lyr) {
    if (layerHasPaths(lyr)) {
      editShapes(lyr.shapes, remapPath);
    }
  });
}

function findDuplicateArcs(nodes) {
  var map = new Int32Array(nodes.arcs.size()),
      count = 0,
      i2;
  for (var i=0, n=nodes.arcs.size(); i<n; i++) {
    i2 = nodes.findDuplicateArc(i);
    map[i] = i2;
    if (i != i2) count++;
  }
  return count > 0 ? map : null;
}
