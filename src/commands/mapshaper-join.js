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
    stop("Missing a joinable data source");
  }
  if (opts.keys) {
    // join using data in attribute fields
    if (opts.keys.length != 2) {
      stop("Expected two key fields: a target field and a source field");
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
    } else if (srcType == 'point' && targetType == 'point') {
      retn = api.joinPointsToPoints(targetLyr, src.layer, opts);
    } else {
      stop(utils.format("Unable to join %s geometry to %s geometry",
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

internal.validateFieldNames = function(arr) {
  arr.forEach(function(name) {
    if (/:(str|num)/.test(name)) {
      stop("Unsupported use of type hints. Use string-fields= or field-types= options instead");
    }
  });
};

api.joinAttributesToFeatures = function(lyr, srcTable, opts) {
  var keys = opts.keys,
      destKey = keys[0],
      srcKey = keys[1],
      destTable = lyr.data,
      // exclude source key field from join unless explicitly listed
      joinFields = opts.fields || utils.difference(srcTable.getFields(), [srcKey]),
      joinFunction = internal.getJoinByKey(destTable, destKey, srcTable, srcKey);
  internal.validateFieldNames(keys);
  opts = utils.defaults({fields: joinFields}, opts);
  return internal.joinTables(destTable, srcTable, joinFunction, opts);
};

// Join data from @src table to records in @dest table
// @join function
//    Receives index of record in the dest table
//    Returns array of matching records in src table, or null if no matches
//
internal.joinTables = function(dest, src, join, opts) {
  var srcRecords = src.getRecords(),
      destRecords = dest.getRecords(),
      unmatchedRecords = [],
      joinFields = internal.getFieldsToJoin(dest.getFields(), src.getFields(), opts),
      sumFields = opts.sum_fields || [],
      copyFields = utils.difference(joinFields, sumFields),
      joinCounts = new Uint32Array(srcRecords.length),
      matchCount = 0,
      collisionCount = 0,
      skipCount = 0,
      retn = {},
      srcRec, srcId, destRec, joinIds, joins, count, filter, calc, i, j, n, m;

  if (opts.where) {
    filter = internal.getJoinFilter(src, opts.where);
  }

  if (opts.calc) {
    calc = internal.getJoinCalc(src, opts.calc);
  }

  // join source records to target records
  for (i=0, n=destRecords.length; i<n; i++) {
    destRec = destRecords[i];
    joins = join(i);
    if (joins && filter) {
      skipCount += joins.length;
      joins = filter(joins);
      skipCount -= joins.length;
    }
    for (j=0, count=0, m=joins ? joins.length : 0; j<m; j++) {
      srcId = joins[j];
      srcRec = srcRecords[srcId];
      if (count === 0) {
        if (copyFields.length > 0) {
          // only copying the first match
          internal.joinByCopy(destRec, srcRec, copyFields);
        }
      } else if (count == 1) {
        collisionCount++; // count target records with multiple joins
      }
      if (sumFields.length > 0) {
        internal.joinBySum(destRec, srcRec, sumFields);
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
      internal.updateUnmatchedRecord(destRec, copyFields, sumFields);
    }
  }
  if (matchCount === 0) {
    stop("No records could be joined");
  }

  internal.printJoinMessage(matchCount, destRecords.length,
      internal.countJoins(joinCounts), srcRecords.length, collisionCount, skipCount);

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

internal.countJoins = function(counts) {
  var joinCount = 0;
  for (var i=0, n=counts.length; i<n; i++) {
    if (counts[i] > 0) {
      joinCount++;
    }
  }
  return joinCount;
};

// Unset fields of unmatched records get null/empty values
internal.updateUnmatchedRecord = function(rec, copyFields, sumFields) {
  internal.joinByCopy(rec, {}, copyFields);
  internal.joinBySum(rec, {}, sumFields);
};

/*
internal.getCountFieldName = function(fields) {
  var uniq = internal.getUniqFieldNames(fields.concat("joins"));
  return uniq.pop();
};
*/

internal.joinByCopy = function(dest, src, fields) {
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

internal.joinBySum = function(dest, src, fields) {
  var f;
  for (var j=0; j<fields.length; j++) {
    f = fields[j];
    dest[f] = (dest[f] || 0) + (src[f] || 0);
  }
};

internal.printJoinMessage = function(matches, n, joins, m, collisions, skipped) {
  // TODO: add tip for generating layer containing unmatched records, when
  // this option is implemented.
  message(utils.format("Joined %'d data record%s", joins, utils.pluralSuffix(joins)));
  if (matches < n) {
    message(utils.format('%d/%d target records received no data', n-matches, n));
  }
  if (collisions > 0) {
    message(utils.format('%d/%d target records were matched by multiple source records', collisions, n));
  }
  if (joins < m) {
    message(utils.format("%d/%d source records could not be joined", m-joins, m));
  }
  if (skipped > 0) {
    message(utils.format("%d/%d source records were skipped", skipped, m));
  }
};

internal.getFieldsToJoin = function(destFields, srcFields, opts) {
  var joinFields;
  if (opts.fields) {
    if (opts.fields.indexOf('*') > -1) {
      joinFields = srcFields;
    } else {
      joinFields = opts.fields;
      internal.validateFieldNames(joinFields);
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
internal.getJoinByKey = function(dest, destKey, src, srcKey) {
  var destRecords = dest.getRecords();
  var index = internal.createTableIndex(src.getRecords(), srcKey);
  if (src.fieldExists(srcKey) === false) {
    stop("External table is missing a field named:", srcKey);
  }
  if (!dest || !dest.fieldExists(destKey)) {
    stop("Target layer is missing key field:", destKey);
  }
  return function(i) {
    var destRec = destRecords[i],
        val = destRec ? destRec[destKey] : null,
        retn = null;
    if (destRec && val in index) {
      retn = index[val];
      if (!Array.isArray(retn)) retn = [retn];
    }
    return retn;
  };
};

internal.createTableIndex = function(records, f) {
  var index = {}, rec, key;
  for (var i=0, n=records.length; i<n; i++) {
    rec = records[i];
    key = rec[f];
    if (key in index === false) {
      index[key] = i;
    } else if (Array.isArray(index[key])) {
      index[key].push(i);
    } else {
      index[key] = [index[key], i];
    }
  }
  return index;
};
