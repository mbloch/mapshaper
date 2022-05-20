import { getXYHash } from '../topology/mapshaper-hash-function';
import utils from '../utils/mapshaper-utils';

// Used for building topology
//
export function ArcIndex(pointCount) {
  var hashTableSize = Math.floor(pointCount * 0.25 + 1),
      hash = getXYHash(hashTableSize),
      hashTable = new Int32Array(hashTableSize),
      chainIds = [],
      arcs = [],
      arcPoints = 0;

  utils.initializeArray(hashTable, -1);

  this.addArc = function(xx, yy) {
    var end = xx.length - 1,
        key = hash(xx[end], yy[end]),
        chainId = hashTable[key],
        arcId = arcs.length;
    hashTable[key] = arcId;
    arcs.push([xx, yy]);
    arcPoints += xx.length;
    chainIds.push(chainId);
    return arcId;
  };

  // Look for a previously generated arc with the same sequence of coords, but in the
  // opposite direction. (This program uses the convention of CW for space-enclosing rings, CCW for holes,
  // so coincident boundaries should contain the same points in reverse sequence).
  //
  this.findDuplicateArc = function(xx, yy, start, end, getNext, getPrev) {
    // First, look for a reverse match
    var arcId = findArcNeighbor(xx, yy, start, end, getNext);
    if (arcId === null) {
      // Look for forward match
      // (Abnormal topology, but we're accepting it because in-the-wild
      // Shapefiles sometimes have duplicate paths)
      arcId = findArcNeighbor(xx, yy, end, start, getPrev);
    } else {
      arcId = ~arcId;
    }
    return arcId;
  };

  function findArcNeighbor(xx, yy, start, end, getNext) {
    var next = getNext(start),
        key = hash(xx[start], yy[start]),
        arcId = hashTable[key],
        arcX, arcY, len;

    while (arcId != -1) {
      // check endpoints and one segment...
      // it would be more rigorous but slower to identify a match
      // by comparing all segments in the coordinate sequence
      arcX = arcs[arcId][0];
      arcY = arcs[arcId][1];
      len = arcX.length;
      if (arcX[0] === xx[end] && arcX[len-1] === xx[start] && arcX[len-2] === xx[next] &&
          arcY[0] === yy[end] && arcY[len-1] === yy[start] && arcY[len-2] === yy[next]) {
        return arcId;
      }
      arcId = chainIds[arcId];
    }
    return null;
  }

  this.getVertexData = function() {
    var xx = new Float64Array(arcPoints),
        yy = new Float64Array(arcPoints),
        nn = new Uint32Array(arcs.length),
        copied = 0,
        arc, len;
    for (var i=0, n=arcs.length; i<n; i++) {
      arc = arcs[i];
      len = arc[0].length;
      utils.copyElements(arc[0], 0, xx, copied, len);
      utils.copyElements(arc[1], 0, yy, copied, len);
      nn[i] = len;
      copied += len;
    }
    return {
      xx: xx,
      yy: yy,
      nn: nn
    };
  };
}
