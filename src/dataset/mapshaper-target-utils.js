/* @requires mapshaper-common */

internal.findCommandTargets = function(pattern, catalog) {
  var targets = [];
  var layers = utils.pluck(catalog.getLayers(), 'layer');
  internal.findMatchingLayers(layers, pattern);
  catalog.getDatasets().forEach(function(dataset) {
    var layers = dataset.layers.filter(function(lyr) {
      return lyr.match_id > -1;
    });
    if (layers.length > 0) {
      targets.push({
        layers: layers,
        dataset: dataset
      });
    }
  });
  return targets;
};

// @pattern is a layer identifier or a comma-sep. list of identifiers.
// An identifier is a literal name, a pattern containing "*" wildcard or
// a 1-based index (1..n)
internal.findMatchingLayers = function(layers, pattern) {
  var matchId = 0;
  pattern.split(',').forEach(function(subpattern, i) {
    var test = internal.getLayerMatch(subpattern);
    // (kludge) assign a match id to each layer; used to set layer order of SVG output
    layers.forEach(function(lyr, layerId) {
      if (i === 0) lyr.match_id = -1;
      if (lyr.match_id == -1 && test(lyr, layerId + 1)) { // layers are 1-indexed
        lyr.match_id = matchId++;
      }
    });
  });
  return layers; // for compatibility w/ tests; todo: remove
};

internal.getLayerMatch = function(pattern) {
  var isIndex = utils.isInteger(Number(pattern));
  var nameRxp = isIndex ? null : utils.wildcardToRegExp(pattern);
  return function(lyr, i) {
    return isIndex ? String(i) == pattern : nameRxp.test(lyr.name || '');
  };
};
