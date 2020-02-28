/* @require
mapshaper-common
mapshaper-delim-import
mapshaper-point-polygon-join
mapshaper-polygon-polygon-join
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
    } else if (srcType == 'polygon' && targetType == 'polygon') {
      retn = internal.joinPolygonsToPolygons(targetLyr, dataset, src, opts);
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
      joinFunction = internal.getJoinByKey(destTable, destKey, srcTable, srcKey);
  internal.validateFieldNames(keys);
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
      prefix = opts.prefix || '',
      unmatchedRecords = [],
      joinFields = internal.getFieldsToJoin(dest.getFields(), src.getFields(), opts),
      sumFields = opts.sum_fields || [],
      copyFields = utils.difference(joinFields, sumFields),
      joinCounts = new Uint32Array(srcRecords.length),
      matchCount = 0,
      collisionCount = 0,
      collisionFields = [],
      skipCount = 0,
      retn = {},
      srcRec, srcId, destRec, joins, count, filter, calc, i, j, n, m;

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
      joins = filter(joins, destRec);
      skipCount -= joins.length;
    }
    for (j=0, count=0, m=joins ? joins.length : 0; j<m; j++) {
      srcId = joins[j];
      srcRec = srcRecords[srcId];
      if (count === 0) {
        if (copyFields.length > 0) {
          // only copying the first match
          internal.joinByCopy(destRec, srcRec, copyFields, prefix);
        }
      } else if (count == 1) {
        if (copyFields.length > 0 && !prefix) {
          internal.findCollisionFields(destRec, srcRec, copyFields, collisionFields);
        }
        collisionCount++; // count target records with multiple joins
      }
      if (sumFields.length > 0) {
        internal.joinBySum(destRec, srcRec, sumFields, prefix);
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
      internal.updateUnmatchedRecord(destRec, copyFields, sumFields, prefix);
    }
  }

  internal.printJoinMessage(matchCount, destRecords.length,
      internal.countJoins(joinCounts), srcRecords.length, skipCount, collisionCount, collisionFields);

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
internal.updateUnmatchedRecord = function(rec, copyFields, sumFields, prefix) {
  internal.joinByCopy(rec, {}, copyFields, prefix);
  internal.joinBySum(rec, {}, sumFields, prefix);
};

/*
internal.getCountFieldName = function(fields) {
  var uniq = internal.getUniqFieldNames(fields.concat("joins"));
  return uniq.pop();
};
*/

internal.joinByCopy = function(dest, src, fields, prefix) {
  var f, f2;
  prefix = prefix || '';
  for (var i=0, n=fields.length; i<n; i++) {
    // dest[fields[i]] = src[fields[i]];
    // Use null when the source record is missing an expected value
    // TODO: think some more about whether this is desirable
    f = fields[i];
    f2 = prefix + f;
    if (Object.prototype.hasOwnProperty.call(src, f)) {
      dest[f2] = src[f];
    } else if (!Object.prototype.hasOwnProperty.call(dest, f2)) {
      dest[f2] = null;
    }
  }
};

internal.joinBySum = function(dest, src, fields, prefix) {
  var f, f2;
  prefix = prefix || '';
  for (var j=0; j<fields.length; j++) {
    f = fields[j];
    f2 = prefix + f;
    dest[f2] = (dest[f2] || 0) + (src[f] || 0);
  }
};

internal.findCollisionFields = function(dest, src, fields, collisionFields) {
  var f;
  for (var i=0, n=fields.length; i<n; i++) {
    f = fields[i];
    if (dest[f] !== src[f] && collisionFields.indexOf(f) === -1) {
      collisionFields.push(f);
    }
  }
};

internal.printJoinMessage = function(matches, n, joins, m, skipped, collisions, collisionFields) {
  // TODO: add tip for troubleshooting join problems, if join is less than perfect.
  if (matches > 0 === false) {
    message("No records could be joined");
    return;
  }
  message(utils.format("Joined data from %'d source record%s to %'d target record%s",
      joins, utils.pluralSuffix(joins), matches, utils.pluralSuffix(matches)));
  if (matches < n) {
    message(utils.format('%d/%d target records received no data', n-matches, n));
  }
  if (joins < m) {
    message(utils.format("%d/%d source records could not be joined", m-joins, m));
  }
  if (skipped > 0) {
    message(utils.format("%d/%d source records were skipped", skipped, m));
  }
  if (collisions > 0) {
    message(utils.format('%d/%d target records were matched by multiple source records', collisions, n));
    if (collisionFields.length > 0) {
      message(utils.format('Found inconsistent values in field%s [%s] during many-to-one join', utils.pluralSuffix(collisionFields.length), collisionFields.join(', ')));
    }
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
    // If a list of fields to join is not given, try to join all of the
    // source fields
    joinFields = srcFields;
    // exclude source key field from key-based join (if fields are not given explicitly)
    if (opts.keys) {
      joinFields = utils.difference(joinFields, [opts.keys[1]]);
    }
  }
  if (!opts.force && !opts.prefix) {
    // overwrite existing fields if the "force" option is set.
    // prefix also overwrites... TODO: consider changing this
    joinFields = utils.difference(joinFields, destFields);
  }
  return joinFields;
};

internal.validateJoinFieldType = function(field, type) {
  if (!type || type == 'object') {
    stop('[' + field + '] field has an unsupported data type. Expected string or number.');
  }
};

// Return a function for translating a target id to an array of source ids based on values
// of two key fields.
internal.getJoinByKey = function(dest, destKey, src, srcKey) {
  var destRecords = dest.getRecords();
  var srcRecords = src.getRecords();
  var index = internal.createTableIndex(srcRecords, srcKey);
  var srcType, destType;
  if (srcRecords.length == 0) {
    // allow empty external tables
    return function(i) {return [];};
  }
  internal.requireDataField(src, srcKey, 'External table is missing a field named:');
  internal.requireDataField(dest, destKey, 'Target layer is missing key field:');
  srcType = internal.getColumnType(srcKey, src.getRecords());
  destType = internal.getColumnType(destKey, destRecords);
  internal.validateJoinFieldType(srcKey, srcType);
  internal.validateJoinFieldType(destKey, destType);
  if (srcType != destType) {
    stop("Join keys have mismatched data types:", destType, "and", srcType);
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
