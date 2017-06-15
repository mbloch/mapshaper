/* @requires mapshaper-common, mapshaper-join-calc */

// Return a function to convert original feature ids into ids of combined features
// Use categorical classification (a different id for each unique value)
internal.getCategoryClassifier = function(field, data) {
  if (!field) return function(i) {return 0;};
  if (!data || !data.fieldExists(field)) {
    stop("Data table is missing field:", field);
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
internal.aggregateDataRecords = function(properties, getGroupId, opts) {
  var groups = internal.groupIds(getGroupId, properties.length),
      sumFields = opts.sum_fields || [],
      copyFields = opts.copy_fields || [],
      calc;

  if (opts.field) {
    copyFields.push(opts.field);
  }

  if (opts.calc) {
    calc = internal.getJoinCalc(new DataTable(properties), opts.calc);
  }

  function sum(field, group) {
    var tot = 0, rec;
    for (var i=0; i<group.length; i++) {
      rec = properties[group[i]];
      tot += rec && rec[field] || 0;
    }
    return tot;
  }

  return groups.map(function(group) {
    var rec = {},
        j, first;
    group = group || [];
    first = properties[group[0]];
    for (j=0; j<sumFields.length; j++) {
      rec[sumFields[j]] = sum(sumFields[j], group);
    }
    for (j=0; j<copyFields.length; j++) {
      rec[copyFields[j]] = first ? first[copyFields[j]] : null;
    }
    if (calc) {
      calc(group, rec);
    }
    return rec;
  });
};

// Returns array containing groups of feature indexes
// @getId() (function) converts feature index into group index
// @n number of features
//
internal.groupIds = function(getId, n) {
  var groups = [], id;
  for (var i=0; i<n; i++) {
    id = getId(i);
    if (id in groups) {
      groups[id].push(i);
    } else {
      groups[id] = [i];
    }
  }
  return groups;
};
