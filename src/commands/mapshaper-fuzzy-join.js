

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
  var getPointIds = internal.getPolygonToPointsFunction(polygonLyr, arcs, pointLyr, opts);
  var getFieldValues = internal.getFieldValuesFunction(pointLyr, field);
  var getNeighbors = internal.getNeighborLookupFunction(polygonLyr, arcs);
  var unassignedData = [];
  var assignedValues = [];
  var confidenceValues = [];
  var neighborValues = [];
  var lowDataIds = [];
  var noDataIds = [];

  // first pass: assign high-confidence values, retain low-confidence data
  polygonLyr.shapes.forEach(function(shp, i) {
    var pointIds = getPointIds(i) || []; // returns null if non found
    var values = getFieldValues(pointIds);
    var data = internal.getModeData(values, true);
    var mode = internal.getHighConfidenceDataValue(data);
    var isHighConfidence = mode !== null;
    var isLowConfidence = !isHighConfidence && data.count > 1;  // using count, not margin
    var isNoConfidence = !isHighConfidence && ~isLowConfidence;
    neighborValues.push(null); // initialize to null
    assignedValues.push(mode); // null or a field value
    unassignedData.push(isHighConfidence ? null : data);
    confidenceValues.push(isHighConfidence && 'high' || isLowConfidence && 'low' || 'none');
    if (isLowConfidence) {
      lowDataIds.push(i);
    } else if (isNoConfidence) {
      noDataIds.push(i);
    }
  });

  // second pass: add strength to low-confidence counts that are bordered by high-confidence shapes
  lowDataIds.forEach(function(shpId) {
    var nabes = getNeighbors(shpId);
    // console.log(shpId, '->', nabes)
    // neighborValues[shpId] = nabes;
    nabes.forEach(function(nabeId) {
      borrowStrength(shpId, nabeId);
    });
    // update mode data
    var countData = unassignedData[shpId];
    var modeData = internal.getCountDataSummary(countData);
    if (modeData.margin > 0) {
      assignedValues[shpId] = modeData.modes[0];
    } else {
      // demote this shape to nodata group
      noDataIds.push(shpId);
    }
    unassignedData[shpId] = null; // done with this data
  });

  internal.insertFieldValues(polygonLyr, field, assignedValues);
  internal.insertFieldValues(polygonLyr, 'confidence', confidenceValues);
  // internal.insertFieldValues(polygonLyr, 'neighbors', neighborValues);
  if (noDataIds.length > 0) {
    api.dataFill(polygonLyr, arcs, {field: field});
  }

  // shpA: id of a low-confidence shape
  // shpB: id of a neighbor shape
  function borrowStrength(shpA, shpB) {
    var val = assignedValues[shpB];
    var data = unassignedData[shpA];
    var counts = data.counts;
    var values = data.values;
    var weight = 2;
    var i;
    if (val === null) return;
    i = values.indexOf(val);
    if (i == -1) {
      values.push(val);
      counts.push(weight);
    } else {
      counts[i] += weight;
    }
  }
};

internal.getNeighborLookupFunction = function(lyr, arcs) {
  var classify = internal.getArcClassifier(lyr.shapes, arcs)(filter);
  var index = {};  // maps shp ids to arrays of neighbor ids

  function filter(a, b) {
    return a > -1 ? [a, b] : null;  // edges are b == -1
  }

  function onArc(arcId) {
    var ab = classify(arcId);
    if (ab) {
      // len = geom.calcPathLen([arcId], arcs, !arcs.isPlanar());
      addArc(ab[0], ab[1]);
      addArc(ab[1], ab[0]);
    }
  }

  function addArc(shpA, shpB) {
    var arr;
    if (shpA == -1 || shpB == -1 || shpA == shpB) return;
    if (shpA in index === false) {
      index[shpA] = [];
    }
    arr = index[shpA];
    if (arr.indexOf(shpB) == -1) {
      arr.push(shpB);
    }
  }
  internal.forEachArcId(lyr.shapes, onArc);
  return function(shpId) {
    return index[shpId] || [];
  };
};

internal.getFieldValuesFunction = function(lyr, field) {
  // receive array of feature ids, return mode data
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

internal.getHighConfidenceDataValue = function(o) {
  if (o.margin > 2) {
    return o.modes[0];
  }
  return null;
};

internal.getNeighborsFunction = function(lyr, arcs, opts) {
  var index = internal.buildAssignmentIndex(lyr, field, arcs);
  var minBorderPct = opts && opts.min_border_pct || 0;

  return function(shpId) {
    var nabes = index[shpId];
    var emptyLen = 0;
    var fieldLen = 0;
    var fieldVal = null;
    var nabe, val, len;

    for (var i=0; i<nabes.length; i++) {
      nabe = nabes[i];
      val = nabe.value;
      len = nabe.length;
      if (internal.isEmptyValue(val)) {
        emptyLen += len;
      } else if (fieldVal === null || fieldVal == val) {
        fieldVal = val;
        fieldLen += len;
      } else {
        // this shape has neighbors with different field values
        return null;
      }
    }

    if (fieldLen / (fieldLen + emptyLen) < minBorderPct) return null;

    return fieldLen > 0 ? fieldVal : null;
  };
};

