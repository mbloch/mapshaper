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



// @getQualifiedLayers (optional) function for resolving qualified patterns
//   (see findMatchingLayers())
export function findCommandTargets(layers, pattern, type, getQualifiedLayers) {
  var matches = findMatchingLayers(layers, pattern, true, getQualifiedLayers);
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
// a 1-based index (1..n). A qualified identifier, like frame1:roads, is
// matched among the layers of a group, here the members of a map frame:
// getQualifiedLayers('frame1') returns that group's layers, or null if there
// is no such group, in which case the identifier is read as a plain name.
export function findMatchingLayers(layers, pattern, throws, getQualifiedLayers) {
  var matchedLayers = [];
  var unmatchedIds = [];
  var index = {};
  pattern.split(',').forEach(function(subpattern, i) {
    var qualified = getQualifiedLayers ? parseQualifiedPattern(subpattern, getQualifiedLayers) : null;
    var test = getLayerMatch(qualified ? qualified.pattern : subpattern);
    var matched = false;
    layers.forEach(function(o, layerId) {
      var groupId;
      // if (matchedLayers.indexOf(lyr) > -1) return; // performance bottleneck with 1000s of layers
      if (qualified) {
        groupId = qualified.layers.indexOf(o.layer);
        if (groupId > -1 && test(o.layer, groupId + 1)) {
          if (!(layerId in index)) {
            matchedLayers.push(o);
            index[layerId] = true;
          }
          matched = true;
        }
      } else if (layerId in index) {
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

function parseQualifiedPattern(subpattern, getQualifiedLayers) {
  var i = subpattern.indexOf(':');
  var layers = i > 0 ? getQualifiedLayers(subpattern.slice(0, i)) : null;
  return layers ? {
    layers: layers.map(function(o) { return o.layer; }),
    pattern: subpattern.slice(i + 1)
  } : null;
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
// (returns name if layer has a unique name, a qualified name like frame1:roads
// if its name is unique in its frame, or else a numerical id, which can
// change as layers are added and moved)
export function getLayerTargetId(catalog, lyr) {
  var nameCount = 0,
      id, qualified;
  catalog.getLayers().forEach(function(o, i) {
    if (lyr.name && o.layer.name == lyr.name) nameCount++;
    if (lyr == o.layer) id = String(i + 1);
  });
  if (!id) error('Layer not found');
  if (nameCount == 1) return lyr.name;
  qualified = nameCount > 1 && catalog.getQualifiedLayerName ?
    catalog.getQualifiedLayerName(lyr) : null;
  return qualified || id;
}
