/* @requires mapshaper-common */

// Return a function to convert original feature ids into ids of combined features
// Use categorical classification (a different id for each unique value)
MapShaper.getCategoryClassifier = function(field, data) {
  if (!field) return function(i) {return 0;};
  if (!data || !data.fieldExists(field)) {
    stop("[dissolve] Data table is missing field:", field);
  }
  var index = {},
      count = 0,
      records = data.getRecords();
  return function(i) {
    var val = String(records[i][field]);
    if (val in index === false) {
      index[val] = count++;
    }
    return index[val];
  };
};

// Return a properties array for a set of aggregated features
//
// @properties input records
// @getGroupId()  converts input record id to id of aggregated record
//
MapShaper.aggregateDataRecords = function(properties, getGroupId, opts) {
  var arr = [];
  var sumFields = opts.sum_fields || [],
      copyFields = opts.copy_fields || [];

  if (opts.field) {
    copyFields.push(opts.field);
  }

  properties.forEach(function(rec, i) {
    if (!rec) return;
    var idx = getGroupId(i),
        dissolveRec;

    if (idx in arr) {
      dissolveRec = arr[idx];
    } else {
      arr[idx] = dissolveRec = {};
      copyFields.forEach(function(f) {
        dissolveRec[f] = rec[f];
      });
    }

    sumFields.forEach(function(f) {
      // TODO: handle strings
      dissolveRec[f] = (rec[f] || 0) + (dissolveRec[f] || 0);
    });
  });
  return arr;
};
