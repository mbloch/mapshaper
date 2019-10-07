/* @require mapshaper-data-fill */

// This is a special-purpose function designed to copy a data field from a points
// layer to a target polygon layer using a spatial join. It tries to create a continuous
// mosaic of data values, even if some of the polygons are not intersected by points.
// It is "fuzzy" because it treats locations in the points file as potentially unreliable.
//
// A typical use case is joining geocoded address data containing a neighborhood
// or precinct field to a Census Block file, in preparation to dissolving the
// blocks into larger polygons.
//
api.fuzzyJoin = function(polygonLyr, arcs, src, opts) {
  var pointLyr = src ? src.layer : null;
  if (!pointLyr || !internal.layerHasPoints(pointLyr)) {
    stop('Missing a point layer to join from');
  }
  if (!pointLyr.data || !pointLyr.data.fieldExists(opts.field)) {
    stop('Missing', opts.field ? '[' + opts.field + '] field' : 'a field parameter');
  }
  internal.requirePolygonLayer(polygonLyr);
  if (opts.dedup_points) {
    api.uniq(pointLyr, null, {expression: 'this.x + "~" + this.y + "~" + d["' + opts.field + '"]'});
  }
  internal.fuzzyJoin(polygonLyr, arcs, pointLyr, opts);
};

internal.fuzzyJoin = function(polygonLyr, arcs, pointLyr, opts) {
  var field = opts.field;
  var getNeighbors = internal.getNeighborLookupFunction(polygonLyr, arcs);
  var getPointIds = internal.getPolygonToPointsFunction(polygonLyr, arcs, pointLyr, opts);
  var getFieldValues = internal.getFieldValuesFunction(pointLyr, field);
  var unassignedData = [];
  var assignedValues = [];
  var lowDataIds = [];
  var noDataIds = [];

  // first pass: assign high-confidence values, retain low-confidence data
  polygonLyr.shapes.forEach(function(shp, i) {
    var values = getFieldValues(getPointIds(i) || []);
    var modeData = internal.getModeData(values, true);
    var modeValue = modeData.modes.length > 0 ? modeData.modes[0] : null;
    // TODO: remove hard-coded margin for establishing high confidence
    var isHighConfidence = modeValue !== null && modeData.margin > 2;
    var isLowConfidence = !isHighConfidence && modeData.count > 1;  // using count, not margin

    assignedValues.push(isHighConfidence ? modeValue : null);
    unassignedData.push(isHighConfidence ? null : modeData);

    if (isLowConfidence) {
      lowDataIds.push(i);
    } else if (!isHighConfidence) {
      noDataIds.push(i);
    }
  });

  // second pass: add strength to low-confidence counts that are bordered by high-confidence shapes
  lowDataIds.forEach(function(shpId) {
    var nabes = getNeighbors(shpId);
    nabes.forEach(function(nabeId) {
      borrowStrength(shpId, nabeId);
    });
    // update mode data
    var countData = unassignedData[shpId];
    var modeData = internal.getCountDataSummary(countData);
    if (modeData.margin > 0) {
      // Assign values to units with a mode value (most common value)
      assignedValues[shpId] = modeData.modes[0];
    } else {
      // Units without a mode have no value... these get filled below, using
      // values from adjacent units.
      noDataIds.push(shpId);
    }
    unassignedData[shpId] = null; // done with this data
  });

  internal.insertFieldValues(polygonLyr, field, assignedValues);

  // fill in missing values using the data-fill function
  if (noDataIds.length > 0) {
    api.dataFill(polygonLyr, arcs, {field: field});
  }

  // remove suspicious data islands (assumed to be caused by geocoding errors, etc)
  if (opts.postprocess) {
    internal.dataFillIslands(field, polygonLyr, arcs, getNeighbors);
  }

  // shpA: id of a low-confidence shape
  // shpB: id of a neighbor shape
  function borrowStrength(shpA, shpB) {
    var val = assignedValues[shpB];
    if (val === null) return;
    var data = unassignedData[shpA];
    var counts = data.counts;
    var values = data.values;
    var weight = 2;
    var i = values.indexOf(val);
    if (i == -1) {
      values.push(val);
      counts.push(weight);
    } else {
      counts[i] += weight;
    }
  }
};

// receive array of feature ids, array of values from a data field
internal.getFieldValuesFunction = function(lyr, field) {
  var records = lyr.data.getRecords();
  return function getFieldValues(ids) {
    var values = [], rec;
    for (var i=0; i<ids.length; i++) {
      rec = records[ids[i]];
      values.push(rec[field]);
    }
    return values;
  };
};
