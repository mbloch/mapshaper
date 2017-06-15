/* @require mapshaper-common, mapshaper-polygon-neighbors */

api.dataFill = function(lyr, arcs, opts) {

  var field = opts.field;
  var count;
  if (!field) stop("Missing required field= parameter");
  if (lyr.geometry_type != 'polygon') stop("Target layer must be polygon type");

  // first, fill some holes?
  count = internal.fillMissingValues(lyr, field, internal.getSingleAssignment(lyr, field, arcs));
  verbose("first pass:", count);
  do {
    count = internal.fillMissingValues(lyr, field, internal.getMultipleAssignment(lyr, field, arcs));
    verbose("count:", count);
  } while (count > 0);

  if (opts.postprocess) {
    internal.fillDataIslands(lyr, field, arcs);
    internal.fillDataIslands(lyr, field, arcs); // kludge: second pass removes flipped donut-holes
  }
};

internal.fillDataIslands = function(lyr, field, arcs) {
  var records = lyr.data.getRecords();
  var getValue = internal.getSingleAssignment(lyr, field, arcs, {min_border_pct: 0.5});
  records.forEach(function(rec, shpId) {
    var val = rec[field];
    var nabe = getValue(shpId);
    if (nabe && nabe != val) {
      rec[field] = nabe;
    }
  });
};

internal.fillMissingValues = function(lyr, field, getValue) {
  var records = lyr.data.getRecords();
  var unassigned = internal.getEmptyRecordIds(records, field);
  var count = 0;
  unassigned.forEach(function(shpId) {
    var value = getValue(shpId);
    if (!internal.isEmptyValue(value)) {
      count++;
      records[shpId][field] = value;
    }
  });
  return count;
};

internal.getSingleAssignment = function(lyr, field, arcs, opts) {
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

internal.isEmptyValue = function(val) {
  return !val && val !== 0;
};

internal.getMultipleAssignment = function(lyr, field, arcs) {
  var index;
  return function(shpId) {
    // create index on first use
    index = index || internal.buildAssignmentIndex(lyr, field, arcs);
    var nabes = index[shpId];
    var nabeIndex = {}; // boundary length indexed by value
    var emptyLen = 0;
    var maxLen = 0;
    var maxVal = null;
    var nabe, val, len;

    for (var i=0; i<nabes.length; i++) {
      nabe = nabes[i];
      val = nabe.value;
      len = nabe.length;
      if (internal.isEmptyValue(val)) {
        emptyLen += len;
        continue;
      }
      if (val in nabeIndex) {
        len += nabeIndex[val];
      }
      if (len > maxLen) {
        maxLen = len;
        maxVal = val;
      }
      nabeIndex[val] = len;
    }
    return maxVal; // may be null
  };
};

internal.getEmptyRecordIds = function(records, field) {
  var ids = [];
  for (var i=0, n=records.length; i<n; i++) {
    if (internal.isEmptyValue(records[i][field])) {
      ids.push(i);
    }
  }
  return ids;
};

internal.buildAssignmentIndex = function(lyr, field, arcs) {
  var shapes = lyr.shapes;
  var records = lyr.data.getRecords();
  var classify = internal.getArcClassifier(shapes, arcs)(filter);
  var index = {};
  var index2 = {};

  // calculate length of shared boundaries of each shape, indexed by shape id
  internal.forEachArcId(shapes, onArc);

  // build final index
  // collects border length and data value of each neighbor, indexed by shape id
  Object.keys(index).forEach(function(shpId) {
    var o = index[shpId];
    var nabes = Object.keys(o);
    var arr = index2[shpId] = [];
    var nabeId;
    for (var i=0; i<nabes.length; i++) {
      nabeId = nabes[i];
      arr.push({
        length: o[nabeId],
        value: nabeId > -1 ? records[nabeId][field] : null
      });
    }
  });

  return index2;

  function filter(a, b) {
    return a > -1 ? [a, b] : null;  // edges are b == -1
  }

  function onArc(arcId) {
    var ab = classify(arcId);
    var len;
    if (ab) {
      len = geom.calcPathLen([arcId], arcs, !arcs.isPlanar());
      addArc(ab[0], ab[1], len);
      if (ab[1] > -1) { // arc is not an outside boundary
        addArc(ab[1], ab[0], len);
      }
    }
  }

  function addArc(shpA, shpB, len) {
    var o = index[shpA] || (index[shpA] = {});
    o[shpB] = len + (o[shpB] || 0);
  }
};
