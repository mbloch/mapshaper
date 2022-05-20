import { getJoinCalc } from '../join/mapshaper-join-calc';
import { requireDataField } from '../dataset/mapshaper-layer-utils';
import { DataTable } from '../datatable/mapshaper-data-table';

// Return a function to convert indexes of original features into indexes of grouped features
// Uses categorical classification (a different id for each unique combination of values)
export function getCategoryClassifier(fields, data) {
  if (!fields || fields.length === 0) return function() {return 0;};
  fields.forEach(function(f) {
    requireDataField(data, f);
  });
  var index = {},
      count = 0,
      records = data.getRecords(),
      getKey = getMultiFieldKeyFunction(fields);
  return function(i) {
    var key = getKey(records[i]);
    if (key in index === false) {
      index[key] = count++;
    }
    return index[key];
  };
}

export function getMultiFieldKeyFunction(fields) {
  return fields.reduce(function(partial, field) {
    // TODO: consider using JSON.stringify for fields that contain objects
    var strval = function(rec) {return String(rec[field]);};
    return partial ? function(rec) {return partial(rec) + '~~' + strval(rec);} : strval;
  }, null);
}

// Performs many-to-one data record aggregation on an array of data records
// Returns an array of data records for a set of aggregated features
//
// @records input records
// @getGroupId()  converts input record id to id of aggregated record
//
export function aggregateDataRecords(records, getGroupId, opts) {
  var groups = groupIds(getGroupId, records.length);
  return aggregateDataRecords2(records, groups, opts);
}

// Performs many-to-many data record aggregation on an array of data records
// (used by the -mosaic command)
// getSourceIds()  receives the id of an output record and returns
//    an array of input record ids
//
export function recombineDataRecords(records, getSourceIds, n, opts) {
  var groups = [];
  for (var i=0; i<n; i++) {
    groups.push(getSourceIds(i));
  }
  return aggregateDataRecords2(records, groups, opts);
}

function aggregateDataRecords2(records, groups, opts) {
  var sumFields = opts.sum_fields || [],
      copyFields = opts.copy_fields || [],
      calc;

  if (opts.fields) {
    copyFields = copyFields.concat(opts.fields);
  }

  if (opts.calc) {
    calc = getJoinCalc(new DataTable(records), opts.calc);
  }

  function sum(field, group) {
    var tot = 0, rec;
    for (var i=0; i<group.length; i++) {
      rec = records[group[i]];
      tot += rec && rec[field] || 0;
    }
    return tot;
  }

  return groups.map(function(group) {
    var rec = {},
        j, first;
    group = group || [];
    first = records[group[0]];
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
}

// Returns array containing groups of feature indexes
// @getId() (function) converts feature index into group index
// @n number of features
//
function groupIds(getId, n) {
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
}
