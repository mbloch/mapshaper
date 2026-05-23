import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';
import { stop } from '../utils/mapshaper-logging';
import { markLayerMetadataChanged, noteLayerMetadataWillChange } from '../undo/mapshaper-undo-tracking';

cmd.renameLayers = function(layers, names) {
  if (names && names.join('').indexOf('=') > -1) {
    renameByAssignment(names, layers);
  } else {
    renameTargetLayers(names, layers);
  }
};

function renameByAssignment(names, layers) {
  var index = mapLayerNames(names);
  layers.forEach(function(lyr) {
    if (index[lyr.name]) {
      noteLayerMetadataWillChange(lyr, {operation: 'rename-layers'});
      lyr.name = index[lyr.name];
      markLayerMetadataChanged(lyr, {operation: 'rename-layers'});
    }
  });
}

function renameTargetLayers(names, layers) {
  var nameCount = names && names.length || 0;
  if (nameCount != layers.length) {
    stop("Expected one name for each target layer; received " + nameCount +
        " name" + (nameCount == 1 ? "" : "s") + " for " + layers.length +
        " target layer" + (layers.length == 1 ? "" : "s"));
  }
  layers.forEach(function(lyr, i) {
    noteLayerMetadataWillChange(lyr, {operation: 'rename-layers'});
    lyr.name = names[i];
    markLayerMetadataChanged(lyr, {operation: 'rename-layers'});
  });
}

// TODO: remove duplication with mapFieldNames()
function mapLayerNames(names) {
  return (names || []).reduce(function(memo, str) {
    var parts = str.split('='),
        dest = utils.trimQuotes(parts[0]),
        src = utils.trimQuotes(parts[1] || '');
    if (!src) stop("Invalid name assignment:", str);
    memo[src] = dest;
    return memo;
  }, {});
}
