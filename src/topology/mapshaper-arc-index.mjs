import { getXYHash } from '../topology/mapshaper-hash-function';
import { initializeArray } from '../utils/mapshaper-utils';

// Used for building topology.
//
// Every arc is stored as a reference into some source coordinate arrays
// (srcXX/srcYY) plus an inclusive [start..end] index range. The caller
// decides which buffer to hand in: the shared xx/yy for normal arcs, or
// a freshly-allocated merged buffer for split/wrap-around arcs. ArcIndex
// doesn't care which — no sentinels, no special cases in its own code.
//
export function ArcIndex(pointCount) {
  var hashTableSize = Math.floor(pointCount * 0.25 + 1),
      hash = getXYHash(hashTableSize),
      hashTable = new Int32Array(hashTableSize),
      chainIds = [],
      arcSrcXX = [],
      arcSrcYY = [],
      arcSrcZZ = [],
      arcStart = [],
      arcEnd = [],
      arcPoints = 0,
      hasZ = false;

  initializeArray(hashTable, -1);

  // Register an arc whose coordinates are `srcXX[start..end]`, `srcYY[start..end]`
  // (inclusive). Returns the new arc id.
  // @srcZZ (optional) simplification thresholds, indexed like srcXX
  this.addArc = function(srcXX, srcYY, start, end, srcZZ) {
    var arcId = arcSrcXX.length,
        key = hash(srcXX[end], srcYY[end]);
    chainIds.push(hashTable[key]);
    hashTable[key] = arcId;
    arcSrcXX.push(srcXX);
    arcSrcYY.push(srcYY);
    arcSrcZZ.push(srcZZ || null);
    if (srcZZ) hasZ = true;
    arcStart.push(start);
    arcEnd.push(end);
    arcPoints += end - start + 1;
    return arcId;
  };

  // Look for a previously generated arc with the same sequence of coords, but
  // in the opposite direction. (This program uses the convention of CW for
  // space-enclosing rings, CCW for holes, so coincident boundaries should
  // contain the same points in reverse sequence.)
  //
  this.findDuplicateArc = function(xx, yy, start, end, getNext, getPrev) {
    var arcId = findArcNeighbor(xx, yy, start, end, getNext);
    if (arcId === null) {
      // Look for forward match (abnormal topology, but we accept it because
      // in-the-wild Shapefiles sometimes have duplicate paths).
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
        sx, sy, s, e;
    while (arcId != -1) {
      sx = arcSrcXX[arcId]; sy = arcSrcYY[arcId];
      s = arcStart[arcId];  e = arcEnd[arcId];
      // Check endpoints and one segment. A more rigorous match would compare
      // every segment, but that's slower and this is sufficient in practice.
      if (sx[s] === xx[end] && sx[e] === xx[start] && sx[e - 1] === xx[next] &&
          sy[s] === yy[end] && sy[e] === yy[start] && sy[e - 1] === yy[next]) {
        return arcId;
      }
      arcId = chainIds[arcId];
    }
    return null;
  }

  // Returns {xx, yy, nn}, plus zz if any arc was added with thresholds. Arc
  // endpoints get an infinite threshold, so simplification never removes a
  // node; vertices of arcs added without thresholds are never removed either.
  this.getVertexData = function() {
    var arcCount = arcSrcXX.length,
        destXX = new Float64Array(arcPoints),
        destYY = new Float64Array(arcPoints),
        destZZ = hasZ ? new Float64Array(arcPoints) : null,
        nn = new Uint32Array(arcCount),
        copied = 0,
        sx, sy, sz, s, e, len, i;
    for (i = 0; i < arcCount; i++) {
      sx = arcSrcXX[i]; sy = arcSrcYY[i];
      s = arcStart[i];  e = arcEnd[i];
      len = e - s + 1;
      if (sx.subarray) {
        destXX.set(sx.subarray(s, e + 1), copied);
        destYY.set(sy.subarray(s, e + 1), copied);
      } else {
        for (var k = 0; k < len; k++) {
          destXX[copied + k] = sx[s + k];
          destYY[copied + k] = sy[s + k];
        }
      }
      if (destZZ) {
        sz = arcSrcZZ[i];
        for (var j = 0; j < len; j++) {
          destZZ[copied + j] = sz ? sz[s + j] : Infinity;
        }
        destZZ[copied] = Infinity;
        destZZ[copied + len - 1] = Infinity;
      }
      nn[i] = len;
      copied += len;
    }
    return {
      xx: destXX,
      yy: destYY,
      zz: destZZ,
      nn: nn
    };
  };
}
