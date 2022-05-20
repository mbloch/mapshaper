import { getXYHash } from '../topology/mapshaper-hash-function';

export function initPointChains(xx, yy) {
  var chainIds = initHashChains(xx, yy),
      j, next, prevMatchId, prevUnmatchId;

  // disentangle, reverse and close the chains created by initHashChains()
  for (var i = xx.length-1; i>=0; i--) {
    next = chainIds[i];
    if (next >= i) continue;
    prevMatchId = i;
    prevUnmatchId = -1;
    do {
      j = next;
      next = chainIds[j];
      if (yy[j] == yy[i] && xx[j] == xx[i]) {
        chainIds[j] = prevMatchId;
        prevMatchId = j;
      } else {
        if (prevUnmatchId > -1) {
          chainIds[prevUnmatchId] = j;
        }
        prevUnmatchId = j;
      }
    } while (next < j);
    if (prevUnmatchId > -1) {
      // Make sure last unmatched entry is terminated
      chainIds[prevUnmatchId] = prevUnmatchId;
    }
    chainIds[i] = prevMatchId; // close the chain
  }
  return chainIds;
}

function initHashChains(xx, yy) {
  // Performance doesn't improve much above ~1.3 * point count
  var n = xx.length,
      m = Math.floor(n * 1.3) || 1,
      hash = getXYHash(m),
      hashTable = new Int32Array(m),
      chainIds = new Int32Array(n), // Array to be filled with chain data
      key, j, i, x, y;

  for (i=0; i<n; i++) {
    x = xx[i];
    y = yy[i];
    if (x != x || y != y) {
      j = -1; // NaN coord: no hash entry, one-link chain
    } else {
      key = hash(x, y);
      j = hashTable[key] - 1; // coord ids are 1-based in hash table; 0 used as null value.
      hashTable[key] = i + 1;
    }
    chainIds[i] = j >= 0 ? j : i; // first item in a chain points to self
  }
  return chainIds;
}
