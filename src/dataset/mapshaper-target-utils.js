/* @requires mapshaper-common */

internal.findCommandTargets = function(catalog, pattern, type) {
  var targets = [];
  var layers = utils.pluck(catalog.getLayers(), 'layer');
  var matches = internal.findMatchingLayers(layers, pattern);
  if (type) matches = matches.filter(function(lyr) {return lyr.geometry_type == type;});
  catalog.getDatasets().forEach(function(dataset) {
    var layers = dataset.layers.filter(function(lyr) {
      return matches.indexOf(lyr) > -1;
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
  var matches = [];
  pattern.split(',').forEach(function(subpattern, i) {
    var test = internal.getLayerMatch(subpattern);
    layers.forEach(function(lyr, layerId) {
      if (matches.indexOf(lyr) > -1) return;
      if (test(lyr, layerId + 1)) {  // layers are 1-indexed
        lyr.match_id = matches.length;
        matches.push(lyr);
      } else {
        lyr.match_id = -1;
      }
    });
  });
  return matches;
};

internal.getLayerMatch = function(pattern) {
  var isIndex = utils.isInteger(Number(pattern));
  var nameRxp = isIndex ? null : utils.wildcardToRegExp(pattern);
  return function(lyr, i) {
    return isIndex ? String(i) == pattern : nameRxp.test(lyr.name || '');
  };
};
