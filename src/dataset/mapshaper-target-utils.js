import { error } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

// convert targets from [{layers: [...], dataset: <>}, ...] format to
// [{layer: <>, dataset: <>}, ...] format
export function expandCommandTargets(targets) {
  return targets.reduce(function(memo, target) {
    target.layers.forEach(function(lyr) {
      memo.push({layer: lyr, dataset: target.dataset});
    });
    return memo;
  }, []);
}

export function findCommandTargets(catalog, pattern, type) {
  var targets = [];
  var layers = utils.pluck(catalog.getLayers(), 'layer');
  var matches = findMatchingLayers(layers, pattern);
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
}

// @pattern is a layer identifier or a comma-sep. list of identifiers.
// An identifier is a literal name, a pattern containing "*" wildcard or
// a 1-based index (1..n)
export function findMatchingLayers(layers, pattern) {
  var matches = [];
  var index = {};
  pattern.split(',').forEach(function(subpattern, i) {
    var test = getLayerMatch(subpattern);
    layers.forEach(function(lyr, layerId) {
      // if (matches.indexOf(lyr) > -1) return; // performance bottleneck with 1000s of layers
      if (layerId in index) return;
      if (test(lyr, layerId + 1)) {  // layers are 1-indexed
        lyr.target_id = matches.length;
        matches.push(lyr);
        index[layerId] = true;
      } else {
        lyr.target_id = -1;
      }
    });
  });
  return matches;
}

export function getLayerMatch(pattern) {
  var isIndex = utils.isInteger(Number(pattern));
  var nameRxp = isIndex ? null : utils.wildcardToRegExp(pattern);
  return function(lyr, i) {
    return isIndex ? String(i) == pattern : nameRxp.test(lyr.name || '');
  };
}

export function countTargetLayers(targets) {
  return targets.reduce(function(memo, target) {
    return memo + target.layers.length;
  }, 0);
}

// get an identifier for a layer that can be used in a target= option
// (returns name if layer has a unique name, or a numerical id)
export function getLayerTargetId(catalog, lyr) {
  var nameCount = 0,
      name = lyr.name,
      id;
  catalog.getLayers().forEach(function(o, i) {
    if (lyr.name && o.layer.name == lyr.name) nameCount++;
    if (lyr == o.layer) id = String(i + 1);
  });
  if (!id) error('Layer not found');
  return nameCount == 1 ? lyr.name : id;
}
