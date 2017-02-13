/* @require
mapshaper-common
mapshaper-delim-import
mapshaper-spatial-join
mapshaper-data-utils
dbf-import
mapshaper-join-filter
mapshaper-join-calc
*/

api.join = function(targetLyr, dataset, src, opts) {
  var srcType, targetType, retn;
  if (!src || !src.layer.data || !src.dataset) {
    stop("[join] Missing a joinable data source");
  }
  if (opts.keys) {
    // join using data in attribute fields
    if (opts.keys.length != 2) {
      stop("[join] Expected two key fields: a target field and a source field");
    }
    retn = api.joinAttributesToFeatures(targetLyr, src.layer.data, opts);
  } else {
    // spatial join
    srcType = src.layer.geometry_type;
    targetType = targetLyr.geometry_type;
    if (srcType == 'point' && targetType == 'polygon') {
      retn = api.joinPointsToPolygons(targetLyr, dataset.arcs, src.layer, opts);
    } else if (srcType == 'polygon' && targetType == 'point') {
      retn = api.joinPolygonsToPoints(targetLyr, src.layer, src.dataset.arcs, opts);
    } else {
      stop(utils.format("[join] Unable to join %s geometry to %s geometry",
          srcType || 'null', targetType || 'null'));
    }
  }

  if (retn.unmatched) {
    dataset.layers.push(retn.unmatched);
  }
  if (retn.unjoined) {
    dataset.layers.push(retn.unjoined);
  }
};

MapShaper.removeTypeHints = function(arr) {
  var arr2 = MapShaper.parseFieldHeaders(arr, {});
  if (arr.join(',') != arr2.join(',')) {
    stop("[join] Type hints are no longer supported. Use field-types= option instead");
  }
  return arr;
};

api.joinAttributesToFeatures = function(lyr, srcTable, opts) {
  var keys = MapShaper.removeTypeHints(opts.keys),
      destKey = keys[0],
      srcKey = keys[1],
      destTable = lyr.data,
      // exclude source key field from join unless explicitly listed
      joinFields = opts.fields || utils.difference(srcTable.getFields(), [srcKey]),
      joinFunction = MapShaper.getJoinByKey(destTable, destKey, srcTable, srcKey);

  opts = utils.defaults({fields: joinFields}, opts);
  return MapShaper.joinTables(destTable, srcTable, joinFunction, opts);
};

// Join data from @src table to records in @dest table
// @join function
//    Receives index of record in the dest table
//    Returns array of matching records in src table, or null if no matches
//
MapShaper.joinTables = function(dest, src, join, opts) {
  var srcRecords = src.getRecords(),
      destRecords = dest.getRecords(),
      unmatchedRecords = [],
      joinFields = MapShaper.getFieldsToJoin(dest.getFields(), src.getFields(), opts),
      sumFields = opts.sum_fields || [],
      copyFields = utils.difference(joinFields, sumFields),
      joinCounts = new Uint32Array(srcRecords.length),
      matchCount = 0,
      collisionCount = 0,
      retn = {},
      srcRec, srcId, destRec, joinIds, joins, count, filter, calc;

  if (opts.where) {
    filter = MapShaper.getJoinFilter(src, opts.where);
  }

  if (opts.calc) {
    calc = MapShaper.getJoinCalc(src, opts.calc);
  }

  // join source records to target records
  for (var i=0, n=destRecords.length; i<n; i++) {
    count = 0;
    destRec = destRecords[i];
    joins = join(i);
    if (joins && filter) {
      joins = filter(joins);
    }
    for (var j=0, m=joins ? joins.length : 0; j<m; j++) {
      srcId = joins[j];
      srcRec = srcRecords[srcId];
      if (copyFields.length > 0) {
        if (count === 0) {
          // only copying the first match
          MapShaper.joinByCopy(destRec, srcRec, copyFields);
        } else {
          collisionCount++;
        }
      }
      if (sumFields.length > 0) {
        MapShaper.joinBySum(destRec, srcRec, sumFields);
      }
      joinCounts[srcId]++;
      count++;
    }
    if (calc) {
      calc(joins, destRec);
    }
    if (count > 0) {
      matchCount++;
    } else if (destRec) {
      if (opts.unmatched) {
        // Save a copy of unmatched record, before null values from join fields
        // are added.
        unmatchedRecords.push(utils.extend({}, destRec));
      }
      MapShaper.updateUnmatchedRecord(destRec, copyFields, sumFields);
    }
  }
  if (matchCount === 0) {
    stop("[join] No records could be joined");
  }

  MapShaper.printJoinMessage(matchCount, destRecords.length,
      MapShaper.countJoins(joinCounts), srcRecords.length, collisionCount);

  if (opts.unjoined) {
    retn.unjoined = {
      name: 'unjoined',
      data: new DataTable(srcRecords.filter(function(o, i) {
        return joinCounts[i] === 0;
      }))
    };
  }
  if (opts.unmatched) {
    retn.unmatched = {
      name: 'unmatched',
      data: new DataTable(unmatchedRecords)
    };
  }
  return retn;
};

MapShaper.countJoins = function(counts) {
  var joinCount = 0;
  for (var i=0, n=counts.length; i<n; i++) {
    if (counts[i] > 0) {
      joinCount++;
    }
  }
  return joinCount;
};

// Unset fields of unmatched records get null/empty values
MapShaper.updateUnmatchedRecord = function(rec, copyFields, sumFields) {
  MapShaper.joinByCopy(rec, {}, copyFields);
  MapShaper.joinBySum(rec, {}, sumFields);
};

/*
MapShaper.getCountFieldName = function(fields) {
  var uniq = MapShaper.getUniqFieldNames(fields.concat("joins"));
  return uniq.pop();
};
*/

MapShaper.joinByCopy = function(dest, src, fields) {
  var f;
  for (var i=0, n=fields.length; i<n; i++) {
    // dest[fields[i]] = src[fields[i]];
    // Use null when the source record is missing an expected value
    // TODO: think some more about whether this is desirable
    f = fields[i];
    if (Object.prototype.hasOwnProperty.call(src, f)) {
      dest[f] = src[f];
    } else if (!Object.prototype.hasOwnProperty.call(dest, f)) {
      dest[f] = null;
    }
  }
};

MapShaper.joinBySum = function(dest, src, fields) {
  var f;
  for (var j=0; j<fields.length; j++) {
    f = fields[j];
    dest[f] = (dest[f] || 0) + (src[f] || 0);
  }
};

MapShaper.printJoinMessage = function(matches, n, joins, m, collisions) {
  // TODO: add tip for generating layer containing unmatched records, when
  // this option is implemented.
  message(utils.format("[join] Joined %'d data record%s", joins, utils.pluralSuffix(joins)));
  if (matches < n) {
    message(utils.format('[join] %d/%d target records received no data', n-matches, n));
  }
  if (joins < m) {
    message(utils.format("[join] %d/%d source records could not be joined", m-joins, m));
  }
  if (collisions > 0) {
    message(utils.format("[join] %'d collision%s occured; data was copied from the first matching source record",
      collisions, utils.pluralSuffix(collisions)));
  }
};

MapShaper.getFieldsToJoin = function(destFields, srcFields, opts) {
  var joinFields;
  if (opts.fields) {
    if (opts.fields.indexOf('*') > -1) {
      joinFields = srcFields;
    } else {
      joinFields = MapShaper.removeTypeHints(opts.fields);
    }
  } else {
    // If a list of fields to join is not given, try to join all the
    // source fields, unless calc= option is present
    joinFields = opts.calc ? [] : srcFields;
  }
  if (!opts.force) {
    // only overwrite existing fields if the "force" option is set.
    joinFields = utils.difference(joinFields, destFields);
  }
  return joinFields;
};

// Return a function for translating a target id to an array of source ids based on values
// of two key fields.
MapShaper.getJoinByKey = function(dest, destKey, src, srcKey) {
  var destRecords = dest.getRecords();
  var index = MapShaper.createTableIndex(src.getRecords(), srcKey);
  if (src.fieldExists(srcKey) === false) {
    stop("[join] External table is missing a field named:", srcKey);
  }
  if (!dest || !dest.fieldExists(destKey)) {
    stop("[join] Target layer is missing key field:", destKey);
  }
  return function(i) {
    var destRec = destRecords[i],
        val = destRec ? destRec[destKey] : null;
    return destRec && val in index ? index[val] : null;
  };
};


MapShaper.createTableIndex = function(records, f) {
  var index = {}, rec, key;
  for (var i=0, n=records.length; i<n; i++) {
    rec = records[i];
    key = rec[f];
    if (key in index) {
      index[key].push(i);
    } else {
      index[key] = [i];
    }
  }
  return index;
};
