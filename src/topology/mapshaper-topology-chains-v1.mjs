import { getXYHash } from '../topology/mapshaper-hash-function';
import utils from '../utils/mapshaper-utils';

// Return an array with data for chains of vertices with same x, y coordinates
// Array contains ids of next point in each chain.
// Unique vertices link to themselves (i.e. arr[n] == n)
//
export function initPointChains(xx, yy) {
  var pointCount = xx.length,
      // Performance doesn't improve much above ~1.3 * point count
      hashTableSize = Math.floor(pointCount * 1.4),
      hash = getXYHash(hashTableSize),
      // Hash table is temporary storage for building chains of coincident points.
      // Hash bins contain the id of the first point in a chain.
      hashTable = new Int32Array(hashTableSize),
      chainIds = new Int32Array(pointCount), // Array to be filled with chain data
      key, headId, x, y;

  utils.initializeArray(hashTable, -1);

  for (var i=0; i<pointCount; i++) {
    x = xx[i];
    y = yy[i];
    key = hash(x, y);
    // key = hash2(x, y, hashTableSize);

    while (true) {
      headId = hashTable[key];
      if (headId == -1) {
        // case -- first coordinate in chain: start new chain, point to self
        hashTable[key] = i;
        chainIds[i] = i;
        break;
      }
      if (xx[headId] == x && yy[headId] == y) {
        // case -- extending a chain: insert new point after head of chain
        chainIds[i] = chainIds[headId];
        chainIds[headId] = i;
        break;
      }
      // Current hash location is taken by a different point;
      // try the next location (linear probing).
      key = (key + 1) % hashTableSize;
    }
  }
  return chainIds;
}
