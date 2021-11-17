import { getNeighborLookupFunction } from '../polygons/mapshaper-polygon-neighbors';
import utils from '../utils/mapshaper-utils';
import { getFeatureCount, requirePolygonLayer } from '../dataset/mapshaper-layer-utils';
import { message, stop, error } from '../utils/mapshaper-logging';

var BALANCE_COLORS = true;

export function getNonAdjacentClassifier(lyr, dataset, colors) {
  requirePolygonLayer(lyr);
  var getNeighbors = getNeighborLookupFunction(lyr, dataset.arcs);
  var errorCount = 0;
  var data = utils.range(getFeatureCount(lyr)).map(function(shpId) {
    var nabes = getNeighbors(shpId) || [];
    return {
      // id: shpId,
      nabes: nabes,
      colorId: -1,
      nabeColors: [],
      uncolored: nabes.length,
      saturation: 0,
      saturation2: 0
    };
  });
  var getSortedColorIds = getUpdateFunction(colors.length);
  var colorIds = getSortedColorIds();
  // Sort adjacency data by number of neighbors in descending order
  var iter = getNodeIterator(data);
  // Assign colors, starting with polygons with the largest number of neighbors
  iter.forEach(function(d) {
    var colorId = pickColor(d, data, colorIds);
    if (colorId == -1) {
      errorCount++;
      colorId = colorIds[0];
    }
    d.colorId = colorId;
    if (BALANCE_COLORS) {
      colorIds = getSortedColorIds(colorId);
    }
  });

  if (errorCount > 0) {
    message(`Unable to find non-adjacent colors for ${errorCount} ${errorCount == 1 ? 'polygon' : 'polygons'}`);
  }
  return function(shpId) {
    return colors[data[shpId].colorId];
  };
}

function getNodeIterator(data) {
  var sorted = data.concat();
  utils.sortOn(sorted, 'uncolored', true);
  function forEach(cb) {
    var item;
    while(sorted.length > 0) {
      item = sorted.pop();
      cb(item);
      updateNeighbors(item, sorted, data);
    }
  }

  return {
    forEach: forEach
  };
}

function updateNeighbors(item, sorted, data) {
  var nabe;
  var ids = item.nabes;
  for (var i=0; i<ids.length; i++) {
    nabe = data[ids[i]];
    if (nabe.colorId > -1) continue;
    updateNeighbor(nabe, item.colorId, sorted);
  }
}

function updateNeighbor(a, colorId, sorted) {
  var i = sorted.indexOf(a); // could optimize with a binary search
  var n = sorted.length;
  var b;
  if (i == -1) {
    error('Indexing error');
  }
  a.uncolored--;
  a.saturation2++;
  if (!a.nabeColors.includes(colorId)) {
    a.saturation++;
    a.nabeColors.push(colorId);
  }
  // insertion sort with a stopping condition
  while (++i < n) {
    b = sorted[i];
    // standard dsatur
    if (a.saturation < b.saturation || a.saturation == b.saturation && a.uncolored > b.uncolored) break;
    // based on 4-color tests with counties and zipcodes, this condition adds a bit of strength
    if (a.saturation == b.saturation && a.uncolored == b.uncolored && a.saturation2 < b.saturation2) break; // 332
    sorted[i-1] = b;
    sorted[i] = a;
  }
}


// Pick the id of a color that is not shared with a neighboring polygon
export function pickColor(d, data, colorIds) {
  var candidateId;
  for (var i=0; i<colorIds.length; i++) {
    candidateId = colorIds[i];
    if (isAvailableColor(d, data, candidateId)) {
      return candidateId;
    }
  }
  return -1; // no colors are available
}

function isAvailableColor(d, data, colorId) {
  var nabes = d.nabes;
  for (var i=0; i<nabes.length; i++) {
    if (data[nabes[i]].colorId === colorId) return false;
  }
  return true;
}

// Update function returns an array of ids, sorted in descending order of preference
// (less-used ids are preferred).
// Function recieves an (optional) id that was just used.
function getUpdateFunction(n) {
  var ids = utils.range(n);
  var counts = new Uint32Array(n);
  return function(i) {
    if (i >= 0 && i < n) {
      counts[i]++;
      utils.sortArrayIndex(ids, counts, true);
    } else if (i !== undefined) {
      error('Unexpected color index:', i);
    }
    return ids;
  };
}
