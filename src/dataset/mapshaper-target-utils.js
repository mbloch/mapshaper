import { error, stop } from '../utils/mapshaper-logging';
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


export function findCommandTargets(layers, pattern, type) {
  var targets = [];
  var matches = findMatchingLayers(layers, pattern, true);
  if (type) {
    matches = matches.filter(function(o) {return o.layer.geometry_type == type;});
  }
  // assign target_id to matched layers
  // (kludge so layers can be sorted in the order that they match; used by -o command)
  layers.forEach(function(o) {o.layer.target_id = -1;});
  matches.forEach(function(o, i) {o.layer.target_id = i;});
  return groupLayersByDataset(matches);
}

// arr: array of {layer: <>, dataset: <>} objects
export function groupLayersByDataset(arr) {
  var datasets = [];
  var targets = [];
  arr.forEach(function(o) {
    var i = datasets.indexOf(o.dataset);
    if (i == -1) {
      datasets.push(o.dataset);
      targets.push({layers: [o.layer], dataset: o.dataset});
    } else {
      targets[i].layers.push(o.layer);
    }
  });
  return targets;
}

// layers: array of {layer: <>, dataset: <>} objects
// pattern: is a layer identifier or a comma-sep. list of identifiers.
// An identifier is a literal name, a pattern containing "*" wildcard or
// a 1-based index (1..n)
export function findMatchingLayers(layers, pattern, throws) {
  var matchedLayers = [];
  var unmatchedIds = [];
  var index = {};
  pattern.split(',').forEach(function(subpattern, i) {
    var test = getLayerMatch(subpattern);
    var matched = false;
    layers.forEach(function(o, layerId) {
      // if (matchedLayers.indexOf(lyr) > -1) return; // performance bottleneck with 1000s of layers
      if (layerId in index) {
        matched = true;
      } else if (test(o.layer, layerId + 1)) {  // layers are 1-indexed
        matchedLayers.push(o);
        index[layerId] = true;
        matched = true;
      }
    });
    if (matched == false) {
      unmatchedIds.push(subpattern);
    }
  });
  if (throws && unmatchedIds.length) {
    stop(utils.format('Missing layer%s: %s', unmatchedIds.length == 1 ? '' : 's', unmatchedIds.join(',')));
  }
  return matchedLayers;
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
