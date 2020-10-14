import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';
import { stop } from '../utils/mapshaper-logging';

cmd.renameLayers = function(layers, names, catalog) {
  if (names && names.join('').indexOf('=') > -1) {
    renameByAssignment(names, catalog);
  } else {
    renameTargetLayers(names, layers);
  }
};

function renameByAssignment(names, catalog) {
  var index = mapLayerNames(names);
  catalog.forEachLayer(function(lyr) {
    if (index[lyr.name]) {
      lyr.name = index[lyr.name];
    }
  });
}

function renameTargetLayers(names, layers) {
  var nameCount = names && names.length || 0;
  var name = '';
  var suffix = '';
  layers.forEach(function(lyr, i) {
    if (i < nameCount) {
      name = names[i];
    }
    if (name && nameCount < layers.length && (i >= nameCount - 1)) {
      suffix = (suffix || 0) + 1;
    }
    lyr.name = name + suffix;
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
