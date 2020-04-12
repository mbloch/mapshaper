
import { getPathEndpointTest } from '../paths/mapshaper-path-endpoints';
import { layerHasPaths } from '../dataset/mapshaper-layer-utils';
import { editShapeParts } from '../paths/mapshaper-shape-utils';
import { absArcId } from '../paths/mapshaper-arc-utils';
import { getArcPresenceTest2 } from '../dataset/mapshaper-layer-utils';
import { verbose } from '../utils/mapshaper-logging';
import { NodeCollection } from '../topology/mapshaper-nodes';
import { ArcCollection } from '../paths/mapshaper-arcs';
import utils from '../utils/mapshaper-utils';

// Dissolve arcs that can be merged without affecting topology of layers
// remove arcs that are not referenced by any layer; remap arc ids
// in layers. (dataset.arcs is replaced).
export function dissolveArcs(dataset) {
  var arcs = dataset.arcs,
      layers = dataset.layers.filter(layerHasPaths);

  if (!arcs || !layers.length) {
    dataset.arcs = null;
    return;
  }

  var arcsCanDissolve = getArcDissolveTest(layers, arcs),
      newArcs = [],
      totalPoints = 0,
      arcIndex = new Int32Array(arcs.size()), // maps old arc ids to new ids
      arcStatus = new Uint8Array(arcs.size());
      // arcStatus: 0 = unvisited, 1 = dropped, 2 = remapped, 3 = remapped + reversed
  layers.forEach(function(lyr) {
    // modify copies of the original shapes; original shapes should be unmodified
    // (need to test this)
    lyr.shapes = lyr.shapes.map(function(shape) {
      return editShapeParts(shape && shape.concat(), translatePath);
    });
  });
  dataset.arcs = dissolveArcCollection(arcs, newArcs, totalPoints);

  function translatePath(path) {
    var pointCount = 0;
    var newPath = [];
    var newArc, arcId, absId, arcLen, fw, newArcId;

    for (var i=0, n=path.length; i<n; i++) {
      arcId = path[i];
      absId = absArcId(arcId);
      fw = arcId === absId;

      if (arcs.arcIsDegenerate(arcId)) {
        // arc has collapsed -- skip
      } else if (arcStatus[absId] !== 0) {
        // arc has already been translated -- skip
        newArc = null;
      } else {
        arcLen = arcs.getArcLength(arcId);

        if (newArc && arcsCanDissolve(path[i-1], arcId)) {
          if (arcLen > 0) {
            arcLen--; // shared endpoint not counted;
          }
          newArc.push(arcId);  // arc data is appended to previous arc
          arcStatus[absId] = 1; // arc is dropped from output
        } else {
          // start a new dissolved arc
          newArc = [arcId];
          arcIndex[absId] = newArcs.length;
          newArcs.push(newArc);
          arcStatus[absId] = fw ? 2 : 3; // 2: unchanged; 3: reversed
        }
        pointCount += arcLen;
      }

      if (arcStatus[absId] > 1) {
        // arc is retained (and renumbered) in the dissolved path -- add to path
        newArcId = arcIndex[absId];
        if (fw && arcStatus[absId] == 3 || !fw && arcStatus[absId] == 2) {
          newArcId = ~newArcId;
        }
        newPath.push(newArcId);
      }
    }
    totalPoints += pointCount;
    return newPath;
  }
}

function dissolveArcCollection(arcs, newArcs, newLen) {
  var nn2 = new Uint32Array(newArcs.length),
      xx2 = new Float64Array(newLen),
      yy2 = new Float64Array(newLen),
      src = arcs.getVertexData(),
      zz2 = src.zz ? new Float64Array(newLen) : null,
      interval = arcs.getRetainedInterval(),
      offs = 0;

  newArcs.forEach(function(newArc, newId) {
    newArc.forEach(function(oldId, i) {
      extendDissolvedArc(oldId, newId);
    });
  });

  return new ArcCollection(nn2, xx2, yy2).setThresholds(zz2).setRetainedInterval(interval);

  function extendDissolvedArc(oldId, newId) {
    var absId = absArcId(oldId),
        rev = oldId < 0,
        n = src.nn[absId],
        i = src.ii[absId],
        n2 = nn2[newId];

    if (n > 0) {
      if (n2 > 0) {
        n--;
        if (!rev) i++;
      }
      utils.copyElements(src.xx, i, xx2, offs, n, rev);
      utils.copyElements(src.yy, i, yy2, offs, n, rev);
      if (zz2) utils.copyElements(src.zz, i, zz2, offs, n, rev);
      nn2[newId] += n;
      offs += n;
    }
  }
}

// Test whether two arcs can be merged together
export function getArcDissolveTest(layers, arcs) {
  var nodes = new NodeCollection(arcs, getArcPresenceTest2(layers, arcs)),
      // don't allow dissolving through endpoints of polyline paths
      lineLayers = layers.filter(function(lyr) {return lyr.geometry_type == 'polyline';}),
      testLineEndpoint = getPathEndpointTest(lineLayers, arcs),
      linkCount, lastId;

  return function(id1, id2) {
    if (id1 == id2 || id1 == ~id2) {
      verbose("Unexpected arc sequence:", id1, id2);
      return false; // This is unexpected; don't try to dissolve, anyway
    }
    linkCount = 0;
    nodes.forEachConnectedArc(id1, countLink);
    return linkCount == 1 && lastId == ~id2 && !testLineEndpoint(id1) && !testLineEndpoint(~id2);
  };

  function countLink(arcId, i) {
    linkCount++;
    lastId = arcId;
  }
}
