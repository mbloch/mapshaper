/* @require mapshaper-common, mapshaper-polygon-neighbors */

api.assign = function(lyr, arcs, opts) {

  var field = opts.field;
  var count;
  if (!field) stop("[assign] Missing required field= parameter");
  if (lyr.geometry_type != 'polygon') stop("[assign] Target layer must be polygon type");

  // first, fill some holes?
  count = MapShaper.fillMissingValues(lyr, field, MapShaper.getSingleAssignment(lyr, field, arcs));
  verbose("first pass:", count);
  do {
    count = MapShaper.fillMissingValues(lyr, field, MapShaper.getMultipleAssignment(lyr, field, arcs));
    verbose("count:", count);
  } while (count > 0);
};

MapShaper.fillMissingValues = function(lyr, field, getValue) {
  var records = lyr.data.getRecords();
  var unassigned = MapShaper.getEmptyRecordIds(records, field);
  var count = 0;
  unassigned.forEach(function(shpId) {
    var value = getValue(shpId);
    if (value) {
      count++;
      records[shpId][field] = value;
    }
  });
  return count;
};

MapShaper.getSingleAssignment = function(lyr, field, arcs) {
  var index = MapShaper.buildAssignmentIndex(lyr, field, arcs);
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
      if (!val) {
        emptyLen += len;
      } else if (!fieldVal || fieldVal == val) {
        fieldVal = val;
        fieldLen += len;
      } else {
        return null;
      }
    }

    return fieldLen > 0 ? fieldVal : null;
  };
};


MapShaper.getMultipleAssignment = function(lyr, field, arcs) {
  var index;
  return function(shpId) {
    // create index on first use
    index = index || MapShaper.buildAssignmentIndex(lyr, field, arcs);
    var nabes = index[shpId];
    var emptyLen = 0;
    var nabeIndex = {}; // tot. length by value
    var nabeCount = 0; // non-empty nabes
    var nabe, val, len;

    for (var i=0; i<nabes.length; i++) {
      nabe = nabes[i];
      val = nabe.value;
      len = nabe.length;
      if (!val) {
        emptyLen += len;
      } else if (val in nabeIndex) {
        nabeIndex[val] += len;
      } else {
        nabeCount++;
        nabeIndex[val] = len;
      }
    }

    return nabeCount > 0 ? getMaxVal(nabeIndex) : null;
  };

  function getMaxVal(nabeIndex) {
    var keys = Object.keys(nabeIndex);
    // sort values in descending order of border length
    keys.sort(function(a, b) {
      return nabeIndex[b] - nabeIndex[a];
    });
    return keys[0];
  }
};

MapShaper.getEmptyRecordIds = function(records, field) {
  var ids = [];
  for (var i=0, n=records.length; i<n; i++) {
    if (!records[i][field]) {
      ids.push(i);
    }
  }
  return ids;
};


MapShaper.buildAssignmentIndex = function(lyr, field, arcs) {
  var shapes = lyr.shapes;
  var records = lyr.data.getRecords();
  var classify = MapShaper.getArcClassifier(shapes, arcs)(filter);
  var index = {};
  var index2 = {};

  // build first index, accumulate length of shared boundaries
  MapShaper.forEachArcId(shapes, onArc);

  // build final index
  Object.keys(index).forEach(function(shpId) {
    var o = index[shpId];
    var nabes = Object.keys(o);
    var arr = index2[shpId] = [];
    var nabeId;
    for (var i=0; i<nabes.length; i++) {
      nabeId = nabes[i];
      arr.push({
        // neighbor: nabeId,
        length: o[nabeId],
        // properties: records[nabeId],
        value: records[nabeId][field]
      });
    }
  });

  return index2;

  function filter(a, b) {
    return b > -1 && a > -1 ? [a, b] : null;
  }

  function onArc(arcId) {
    var ab = classify(arcId);
    var len;
    if (ab) {
      len = geom.calcPathLen([arcId], arcs, !arcs.isPlanar());
      addArc(ab[0], ab[1], len);
      addArc(ab[1], ab[0], len);
    }
  }

  function addArc(shpA, shpB, len) {
    var o = index[shpA] || (index[shpA] = {});
    o[shpB] = len + (o[shpB] || 0);
  }
};
