
import { ArcLookupIndex, IdLookupIndex } from '../indexes/mapshaper-id-lookup-index';
import { traversePaths, getArcPresenceTest } from '../paths/mapshaper-path-utils';

// Return function for returning connected groups of rings...
// Function recieves a ring (represented as an array of arcs)
// Function returns an array of connected rings
export function getConnectivityLookupFunction(lyr, arcs) {

}

function indexRings(lyr, arcs) {
  var ringShapes = [];
  var ringToShapeIndex = [];
  var arcToRingIndex = new ArcLookupIndex(arcs.size());
  var islands = [];
  var ringToIslandIndex;
  var ringId;
  var islandId;

  // build indexes to map rings to shapes and arcs to rings
  traversePaths(lyr.shapes, null, onRing);

  // build islands
  ringToIslandIndex = new IdLookupIndex(ringShapes.length);
  ringShapes.forEach(function(shp, ringId) {
    var islandId = ringToIslandIndex.getId(ringId);
    if (islandId == -1) {
      newIsland(ringId);
    }
  });

  function newIsland(ringId) {
    var ring = ringShapes[ringId][0];
    islandId = islands.length;

  }


  function onRing(o) {
    ringId = ringShapes.length;
    ringShapes.push([o.arcs]);
    ringToShapeIndex.push(o.shapeId);
    o.arcs.forEach(onArc);
  }

  function onArc(arcId) {
    arcToRingIndex.setId(arcId, ringId);
  }

}
