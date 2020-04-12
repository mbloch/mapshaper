import { getNeighborLookupFunction } from '../polygons/mapshaper-polygon-neighbors';
import { requireDataField } from '../dataset/mapshaper-layer-utils';
import cmd from '../mapshaper-cmd';
import { message, stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import geom from '../geom/mapshaper-geom';

// This function creates a continuous mosaic of data values in a
// given field by assigning data from adjacent polygon features to polygons
// that contain null values.
// The 'contiguous' option removes data islands to create contiguous groups
// that are likely to be the result of unreliable data (e.g. faulty geocodes).

cmd.dataFill = function(lyr, arcs, opts) {
  var field = opts.field;
  if (!field) stop("Missing required field= parameter");
  requireDataField(lyr, field);
  if (lyr.geometry_type != 'polygon') stop("Target layer must be polygon type");
  var getNeighbors = getNeighborLookupFunction(lyr, arcs);
  var fillCount, islandCount;

  // get function to check if a shape was empty before data-fill
  var initiallyEmpty = (function() {
    var flags = lyr.data.getRecords().map(function(rec) {
      return isEmptyValue(rec[field]);
    });
    return function(i) {return flags[i];};
  }());

  // step one: fill empty units
  fillCount = dataFillEmpty(field, lyr, arcs, getNeighbors);

  // step two: smooth perimeters
  dataFillSmooth(field, lyr, arcs, getNeighbors, initiallyEmpty);

  // step three: remove non-contiguous data islands
  if (opts.contiguous) {
    islandCount = dataFillIslandGroups(field, lyr, arcs, getNeighbors, opts);
  }

  message('Filled', fillCount, 'empty polygons' + utils.pluralSuffix(fillCount));
  if (islandCount > 0) {
    message('Removed', islandCount, 'non-contiguous polygon group' + utils.pluralSuffix(islandCount));
  }
};

// Assign values to units without data, using the values of neighboring units.
function dataFillEmpty(field, lyr, arcs, getNeighbors) {
  var records = lyr.data.getRecords();
  var onShape = getDataFillCalculator(field, lyr, arcs, getNeighbors);
  var isEmpty = getEmptyValueFilter(field, lyr);
  var groups = {}; // groups, indexed by key
  var assignCount = 0;

  // step one: place features in groups based on data values of non-empty neighbors.
  // (grouping is an attempt to avoid ragged edges between groups of same-value units,
  // which occured when data was assigned to units independently of adjacent units).
  lyr.shapes.forEach(function(shp, i) {
    if (!isEmpty(i)) return; // only assign shapes with missing values
    var data = onShape(i);
    if (!data.group) return; // e.g. if no neighbors have data
    addDataToGroup(data, groups);
  });

  // step two: assign the same value to all members of a group
  Object.keys(groups).forEach(function(groupId) {
    var group = groups[groupId];
    var value = getMaxWeightValue(group);
    assignValueToShapes(group.shapes, value);
  });

  function assignValueToShapes(ids, val) {
    ids.forEach(function(id) {
      assignCount++;
      records[id][field] = val;
    });
  }

  function addDataToGroup(d, groups) {
    var group = groups[d.group];
    var j;
    if (!group) {
      groups[d.group] = {
        shapes: [d.shape],
        weights: d.weights,
        values: d.values
      };
      return;
    }
    group.shapes.push(d.shape);
    for (var i=0, n=d.values.length; i<n; i++) {
      // add new weights to the group's total weights
      j = group.values.indexOf(d.values[i]);
      group.weights[j] += d.weights[i];
    }
  }

  if (assignCount > 0) {
    // recursively fill empty neighbors of the newly filled shapes
    assignCount += dataFillEmpty(field, lyr, arcs, getNeighbors);
  }
  return assignCount;
}


// Try to smooth out jaggedness resulting from filling empty units
// This function assigns a different adjacent data value to formerly empty units,
// if this would produce a shorter boundary.
function dataFillSmooth(field, lyr, arcs, getNeighbors, wasEmpty) {
  var onShape = getDataFillCalculator(field, lyr, arcs, getNeighbors);
  var records = lyr.data.getRecords();
  var updates = 0;
  lyr.shapes.forEach(function(shp, i) {
    if (!wasEmpty(i)) return; // only edit shapes that were originally empty
    var data = onShape(i);
    if (data.values.length < 2) return; // no other values are available
    var currVal = records[i][field];
    var topVal = getMaxWeightValue(data);
    if (currVal != topVal) {
      records[i][field] = topVal;
      updates++;
    }
  });
  return updates;
}

// Remove less-important data islands to ensure that data groups are contiguous
//
function dataFillIslandGroups(field, lyr, arcs, getNeighbors, opts) {
  var records = lyr.data.getRecords();
  var groupsByValue = {}; // array of group objects, indexed by data values
  var unitIndex = new Uint8Array(lyr.shapes.length);
  var currGroup = null;
  var islandCount = 0;
  var weightField = opts.weight_field || null;

  if (weightField) {
    requireDataField(lyr, weightField);
  }

  // 1. form groups of contiguous units with the same attribute value
  lyr.shapes.forEach(function(shp, shpId) {
    onShape(shpId);
  });

  // 2. retain the most important group for each value; discard satellite groups
  Object.keys(groupsByValue).forEach(function(val) {
    var groups = groupsByValue[val];
    var maxIdx;
    if (groups.length < 2) return;
    maxIdx = indexOfMaxValue(groups, 'weight');
    if (maxIdx == -1) return; // error condition...
    groups
      .filter(function(group, i) {return i != maxIdx;})
      .forEach(clearIslandGroup);
  });

  // 3. fill gaps left by removing groups
  if (islandCount > 0) {
    dataFillEmpty(field, lyr, arcs, getNeighbors);
  }
  return islandCount;

  function clearIslandGroup(group) {
    islandCount++;
    group.shapes.forEach(function(shpId) {
      records[shpId][field] = null;
    });
  }

  function onShape(shpId) {
    if (unitIndex[shpId] == 1) return; // already added to a group
    var val = records[shpId][field];
    var firstShape = false;
    if (isEmptyValue(val)) return;
    if (!currGroup) {
      // start a new group
      firstShape = true;
      currGroup = {
        value: val,
        shapes: [],
        weight: 0
      };
      if (val in groupsByValue === false) {
        groupsByValue[val] = [];
      }
      groupsByValue[val].push(currGroup);
    } else if (val != currGroup.value) {
      return;
    }
    if (weightField) {
      currGroup.weight += records[shpId][weightField];
    } else {
      currGroup.weight += geom.getShapeArea(lyr.shapes[shpId], arcs);
    }
    currGroup.shapes.push(shpId);
    unitIndex[shpId] = 1;
    // TODO: consider switching from depth-first traversal to breadth-first
    getNeighbors(shpId).forEach(onShape);
    if (firstShape) {
      currGroup = null;
    }
  }
}


// Return value with the greatest weight from a datafill object
function getMaxWeightValue(d) {
  var maxWeight = Math.max.apply(null, d.weights);
  var i = d.weights.indexOf(maxWeight);
  return d.values[i]; // return highest weighted value
}

// TODO: move to a more sensible file... mapshaper-calc-utils?
function indexOfMaxValue(arr, key) {
  var maxWeight = -Infinity;
  var idx = -1;
  arr.forEach(function(o, i) {
    if (o.weight > maxWeight) {
      idx = i;
      maxWeight = o.weight;
    }
  });
  return idx;
}

function isEmptyValue(val) {
   return !val && val !== 0;
}

function getEmptyValueFilter(field, lyr) {
  var records = lyr.data.getRecords();
  return function(i) {
    var rec = records[i];
    return rec ? isEmptyValue(rec[field]) : false;
  };
}

// Returns a function to fetch the values of a data field from the neighbors of
// a polygon feature. Each value is assigned a weight in proportion to the
// length of the borders between the polygon and its neighbors.
function getDataFillCalculator(field, lyr, arcs, getNeighbors) {
  var isPlanar = arcs.isPlanar();
  var records = lyr.data.getRecords();
  var tmp;

  function onSharedArc(nabeId, arcId) {
    var weight, i;
    var val = records[nabeId][field];
    if (isEmptyValue(val)) return;
    // weight is the length of the shared border
    // TODO: consider support for alternate weighting schemes
    weight = geom.calcPathLen([arcId], arcs, !isPlanar);
    i = tmp.values.indexOf(val);
    if (i == -1) {
      tmp.values.push(val);
      tmp.weights.push(weight);
    } else {
      tmp.weights[i] += weight;
    }
  }

  return function(shpId) {
    tmp = {
      shape: shpId,
      weights: [],
      values: [],
      group: ''
    };
    getNeighbors(shpId, onSharedArc);
    tmp.group = tmp.values.concat().sort().join('~');
    return tmp;
  };
}
