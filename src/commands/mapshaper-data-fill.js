/* @require mapshaper-common, mapshaper-polygon-neighbors */

// This function creates a continuous mosaic of data values in a
// given field by assigning data from adjacent polygon features to polygons
// that contain null values.
// The 'postprocess' option tries to smooth the output by removing data islands
// that are likely to be the result of unreliable data (e.g. faulty geocodes).

api.dataFill = function(lyr, arcs, opts) {
  var field = opts.field;
  if (!field) stop("Missing required field= parameter");
  if (!lyr.data || !lyr.data.fieldExists(field)) stop("Layer is missing field:", field);
  if (lyr.geometry_type != 'polygon') stop("Target layer must be polygon type");
  var getNeighbors = internal.getNeighborLookupFunction(lyr, arcs);
  var loopCount = 0;
  var fillCount;

  // get function to check if a shape was initially empty
  var initiallyEmpty = (function() {
    var flags = lyr.data.getRecords().map(function(rec) {
      return internal.isEmptyValue(rec[field]);
    });
    return function(i) {return flags[i];};
  }());

  // step one: fill empty units
  do {
    fillCount = internal.dataFillEmpty(field, lyr, arcs, getNeighbors);
  } while (fillCount > 0 && ++loopCount < 10);

  // step two: smooth perimeters
  internal.dataFillSmooth(field, lyr, arcs, getNeighbors, initiallyEmpty);

  // step three: remove data inclusions
  if (opts.postprocess) {
    internal.dataFillIslands(field, lyr, arcs, getNeighbors);
  }
};

// TODO: think of edge cases where this might now work well... e.g. donut shapes
internal.dataFillIslands = function(field, lyr, arcs, getNeighbors) {
  var onShape = getDataFillCalculator(field, lyr, arcs, getNeighbors);
  var areas = {}; // total area of each group
  var islands = [];
  var records = lyr.data.getRecords();
  var updates = 0;

  lyr.shapes.forEach(function(shp, i) {
    var data = onShape(i);
    var area = geom.getShapeArea(shp, arcs);
    var val = records[i][field];
    if (internal.isEmptyValue(val)) return;
    if (val in areas === false) areas[val] = 0;
    areas[val] += area;
    if (data.values.length > 0 && data.values.indexOf(val) === -1) {
      // counts as island if it
      // a. has neighbors with data and
      // b. neighbors have different data
      data.area = area;
      islands.push(data);
    }
  });

  // fill small islands
  islands.forEach(function(data) {
    var val = records[data.shape][field];
    var pct = data.area / areas[val];
    // don't remove islands that represent a large portion of this value's area
    if (pct > 0.3) return;
    records[data.shape][field] = internal.getMaxWeightValue(data);
    updates++;
  });
  return updates;
};

// Try to smooth out jaggedness resulting from filling empty units
// This function assigns a different adjacent data value to formerly empty units,
// if this would produce a shorter boundary.
internal.dataFillSmooth = function(field, lyr, arcs, getNeighbors, wasEmpty) {
  var onShape = getDataFillCalculator(field, lyr, arcs, getNeighbors);
  var records = lyr.data.getRecords();
  var updates = 0;
  lyr.shapes.forEach(function(shp, i) {
    if (!wasEmpty(i)) return; // only edit shapes that were originally empty
    var data = onShape(i);
    if (data.values.length < 2) return; // no other values are available
    var currVal = records[i][field];
    var topVal = internal.getMaxWeightValue(data);
    if (currVal != topVal) {
      records[i][field] = topVal;
      updates++;
    }
  });
  return updates;
};

// Return value with the greatest weight from a datafill object
internal.getMaxWeightValue = function(d) {
  var maxWeight = Math.max.apply(null, d.weights);
  var i = d.weights.indexOf(maxWeight);
  return d.values[i]; // return highest weighted value
};

// Assign values to units without data, using the values of neighboring units.
internal.dataFillEmpty = function(field, lyr, arcs, getNeighbors) {
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
    var value = internal.getMaxWeightValue(group);
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

  return assignCount;
};

internal.isEmptyValue = function(val) {
   return !val && val !== 0;
};

function getEmptyValueFilter(field, lyr) {
  var records = lyr.data.getRecords();
  return function(i) {
    var rec = records[i];
    return rec ? internal.isEmptyValue(rec[field]) : false;
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
    var val = records[nabeId][field];
    // console.log("nabe:", nabeId, "val:", val)
    if (internal.isEmptyValue(val)) return;
    var len = geom.calcPathLen([arcId], arcs, !isPlanar);
    var i = tmp.values.indexOf(val);
    if (i == -1) {
      tmp.values.push(val);
      tmp.weights.push(len);
    } else {
      tmp.weights[i] += len;
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
