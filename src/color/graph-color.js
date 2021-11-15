import { getNeighborLookupFunction } from '../polygons/mapshaper-polygon-neighbors';
import utils from '../utils/mapshaper-utils';
import { getFeatureCount, requirePolygonLayer } from '../dataset/mapshaper-layer-utils';
import { message, stop, error } from '../utils/mapshaper-logging';

export function getNonAdjacentClassifier(lyr, dataset, colors) {
  requirePolygonLayer(lyr);
  var getNeighbors = getNeighborLookupFunction(lyr, dataset.arcs);
  var errorCount = 0;
  var data = utils.range(getFeatureCount(lyr)).map(function(shpId) {
    var nabes = getNeighbors(shpId) || [];
    return {
      nabes: nabes,
      n: nabes.length,
      colorId: -1
    };
  });
  var getSortedColorIds = getUpdateFunction(colors.length);
  var colorIds = getSortedColorIds();
  // Sort adjacency data by number of neighbors in descending order
  var sorted = data.concat();
  utils.sortOn(sorted, 'n', false);
  // Assign colors, starting with polygons with the largest number of neighbors
  sorted.forEach(function(d) {
    var colorId = pickColor(d, data, colorIds);
    if (colorId == -1) {
      errorCount++;
      colorId = colorIds[0];
    }
    d.colorId = colorId;
    colorIds = getSortedColorIds(colorId);
  });

  if (errorCount > 0) {
    message(`Unable to find non-adjacent colors for ${errorCount} ${errorCount == 1 ? 'polygon' : 'polygons'}`);
  }
  return function(shpId) {
    return colors[data[shpId].colorId];
  };
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
