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
  internal.requireDataField(pointLyr, opts.field);
  internal.requirePolygonLayer(polygonLyr);
  if (opts.dedup_points) {
    api.uniq(pointLyr, null, {expression: 'this.x + "~" + this.y + "~" + this.properties[' + JSON.stringify(opts.field) + ']', verbose: false});
  }
  internal.fuzzyJoin(polygonLyr, arcs, pointLyr, opts);
};

internal.fuzzyJoin = function(polygonLyr, arcs, pointLyr, opts) {
  var field = opts.field;
  // using first_match param: don't let a point be assigned to multiple polygons
  var getPointIds = internal.getPolygonToPointsFunction(polygonLyr, arcs, pointLyr, {first_match: true});
  var getFieldValues = internal.getFieldValuesFunction(pointLyr, field);
  var assignedValues = [];
  var countData = [];
  var modeCounts = [];

  // Step one: assign join values to mode value; resolve ties
  polygonLyr.shapes.forEach(function(shp, i) {
    var pointIds = getPointIds(i) || [];
    var values = getFieldValues(pointIds);
    var modeData = internal.getModeData(values, true);
    var modeValue = modeData.margin > 0 ? modeData.modes[0] : null;
    var isTie = modeValue === null && modeData.modes.length > 1;
    if (isTie) {
      // resolve ties by picking between the candidate data values
      // todo: consider using this method to evaluate near-ties as well
      modeValue = internal.resolveFuzzyJoinTie(modeData.modes, pointLyr, pointIds, field, shp, arcs);
    }
    modeCounts[i] = modeData.count || 0;
    // retain count/mode data, to use later for restoring dropouts
    if (opts.no_dropouts) {
      countData.push(modeData);
    }
    assignedValues.push(modeValue);
  });

  internal.insertFieldValues(polygonLyr, 'join-count', modeCounts);
  internal.insertFieldValues(polygonLyr, field, assignedValues);

  // fill in missing values, etc. using the data-fill function
  api.dataFill(polygonLyr, arcs,
    {field: field, weight_field: 'join-count', contiguous: opts.contiguous});

  // restore dropouts
  if (opts.no_dropouts) {
    var missingValues = internal.findDropoutValues(polygonLyr, pointLyr, field);
    if (missingValues.length > 0) {
      restoreDropoutValues(polygonLyr, field, missingValues, countData);
    }
  }

};

// Returns a function for converting an array of feature ids to an array of values from a given data field.
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

internal.findDropoutValues = function(targetLyr, sourceLyr, field) {
  var sourceValues = internal.getUniqFieldValues(sourceLyr.data.getRecords(), field);
  var targetValues = internal.getUniqFieldValues(targetLyr.data.getRecords(), field);
  var missing = utils.difference(sourceValues, targetValues);
  return missing;
};

function restoreDropoutValues(lyr, field, missingValues, countData) {
  var records = lyr.data.getRecords();
  var failures = [];
  var restoredIds = [];

  var targetIds = missingValues.map(function(missingValue) {
    var shpId = internal.findDropoutInsertionShape(missingValue, countData);
    if (shpId > -1 && restoredIds.indexOf(shpId) === -1) {
      records[shpId][field] = missingValue;
      restoredIds.push(shpId);
    } else {
      failures.push(missingValue);
    }
  });

  message('Restored', restoredIds.length, 'dropout value' + utils.pluralSuffix(restoredIds.length));

  // TODO: handle different kinds of failure differently:
  // a. values that point-to-polygon failed to match to a polygon
  // b. multiple dropout values are assigned to the same target polygon
  // c. restoring a dropout results in replacing the only instance of another value
  if (failures.length > 0) {
    message('Failed to restore dropout value(s):', failures.join(', '));
  }
}

internal.findDropoutInsertionShape = function(value, countData) {
  var id = -1;
  var count = 0;
  countData.forEach(function(d, shpId) {
    var i = d.values.indexOf(value);
    var n = i > -1 ? d.counts[i] : 0;
    if (n > count) {
      id = shpId;
      count = n;
    }
  });
  return id;
};

// TODO: move to more appropriate file
internal.getPointsToPolygonDistance = function(points, poly, arcs) {
  // todo: handle multipoint geometry (this function will return an invalid distance
  // if the first point in a multipoint feature falls outside the target polygon
  var p = points[0];
  // unsigned distance to nearest polygon boundary
  return geom.getPointToShapeDistance(p[0], p[1], poly, arcs);
};

internal.resolveFuzzyJoinTie = function(modeValues, pointLyr, pointIds, field, shp, arcs) {
  var weights = modeValues.map(function() {return 0;}); // initialize to 0
  pointIds.forEach(function(pointId) {
    var coords = pointLyr.shapes[pointId];
    var val = pointLyr.data.getRecordAt(pointId)[field];
    var i = modeValues.indexOf(val);
    if (i === -1) return;
    var dist = internal.getPointsToPolygonDistance(coords, shp, arcs);
    weights[i] += dist;
  });
  // use value with the highest weight
  var maxWeight = Math.max.apply(null, weights);
  var maxValue = modeValues[weights.indexOf(maxWeight)];
  return maxValue;
};
