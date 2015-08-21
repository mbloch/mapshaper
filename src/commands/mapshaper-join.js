/* @require
mapshaper-common
mapshaper-expressions
mapshaper-dbf-table
mapshaper-delim-import
mapshaper-spatial-join
*/

api.join = function(targetLyr, dataset, opts) {
  var src, srcLyr, srcType, targetType;
  if (opts.keys) {
    // join using data in attribute fields
    if (opts.keys.length != 2) {
      stop("[join] Expected two key fields: a target field and a source field");
    }
    src = MapShaper.getJoinTable(dataset, opts);
    api.joinAttributesToFeatures(targetLyr, src, opts);
  } else {
    // spatial join
    src = MapShaper.getJoinData(dataset, opts);
    if (!src) {
      stop("[join] Missing a joinable data source");
    }
    srcLyr = src.layers[0];
    srcType = srcLyr.geometry_type;
    targetType = targetLyr.geometry_type;
    if (srcType == 'point' && targetType == 'polygon') {
      api.joinPointsToPolygons(targetLyr, dataset.arcs, srcLyr, opts);
    } else if (srcType == 'polygon' && targetType == 'point') {
      api.joinPolygonsToPoints(targetLyr, srcLyr, src.arcs, opts);
    } else {
      stop(utils.format("[join] Unable to join %s geometry to %s geometry",
          srcType || 'null', targetType || 'null'));
    }
  }
};

// Get a DataTable to join, either from a current layer or from a file.
MapShaper.getJoinTable = function(dataset, opts) {
  var layers = MapShaper.findMatchingLayers(dataset.layers, opts.source),
      table;
  if (layers.length > 0) {
    table = layers[0].data;
  } else {
    table = api.importJoinTable(opts.source, opts);
  }
  return table;
};

// Get a dataset containing a source layer to join
// TODO: remove duplication with getJoinTable()
MapShaper.getJoinData = function(dataset, opts) {
  var layers = MapShaper.findMatchingLayers(dataset.layers, opts.source);
  if (!layers.length) {
    dataset = api.importFile(opts.source, opts);
    layers = dataset.layers;
  }
  return layers.length ? {arcs: dataset.arcs, layers: [layers[0]]} : null;
};

api.importJoinTable = function(file, opts) {
  var fieldsWithTypeHints = [];
  if (opts.keys) {
    fieldsWithTypeHints.push(opts.keys[1]);
  }
  if (opts.fields) {
    fieldsWithTypeHints = fieldsWithTypeHints.concat(opts.fields);
  }
  if (opts.field_types) {
    fieldsWithTypeHints = fieldsWithTypeHints.concat(opts.field_types);
  }
  var importOpts = utils.defaults({field_types: fieldsWithTypeHints}, opts);
  return api.importDataTable(file, importOpts);
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
  MapShaper.joinTables(destTable, srcTable, joinFunction, opts);
};

MapShaper.joinTables = function(dest, src, join, opts) {
  var srcRecords = src.getRecords(),
      destRecords = dest.getRecords(),
      joinFields = MapShaper.getFieldsToJoin(dest, src, opts),
      sumFields = opts.sum_fields || [],
      copyFields = utils.difference(joinFields, sumFields),
      countField = MapShaper.getCountFieldName(dest.getFields()),
      addCountField = sumFields.length > 0, // add a count field if we're aggregating records
      joinCounts = new Uint32Array(srcRecords.length),
      matchCount = 0,
      collisionCount = 0,
      srcRec, srcId, destRec, joinIds, joins, count, filter;

  if (opts.where) {
    filter = MapShaper.getJoinFilter(src, opts.where);
  }

  // join source records to target records
  for (var i=0, n=destRecords.length; i<n; i++) {
    destRec = destRecords[i];
    joins = join(i);
    count = 0;
    for (var j=0, m=joins ? joins.length : 0; j<m; j++) {
      srcId = joins[j];
      if (filter && !filter(srcId)) {
        continue;
      }
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
    if (count > 0) {
      matchCount++;
    } else if (destRec) {
      // Unmatched records records get null/empty values
      MapShaper.updateUnmatchedRecord(destRec, copyFields, sumFields);
    }
    if (addCountField) {
      destRec[countField] = count;
    }
  }
  if (matchCount === 0) {
    stop("[join] No records could be joinCount");
  }
  MapShaper.printJoinMessage(matchCount, destRecords.length,
      MapShaper.countJoins(joinCounts), srcRecords.length, collisionCount);
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

MapShaper.updateUnmatchedRecord = function(rec, copyFields, sumFields) {
  MapShaper.joinByCopy(rec, {}, copyFields);
  MapShaper.joinBySum(rec, {}, sumFields);
};

MapShaper.getCountFieldName = function(fields) {
  var uniq = MapShaper.getUniqFieldNames(fields.concat("joins"));
  return uniq.pop();
};

MapShaper.joinByCopy = function(dest, src, fields) {
  var f;
  for (var i=0, n=fields.length; i<n; i++) {
    // dest[fields[i]] = src[fields[i]];
    // Use null when the source record is missing an expected value
    // TODO: think some more about whether this is desirable
    f = fields[i];
    dest[f] = Object.prototype.hasOwnProperty.call(src, f) ? src[f] : null;
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

MapShaper.getFieldsToJoin = function(destTable, srcTable, opts) {
  var joinFields;
  if (opts.fields) {
    joinFields = MapShaper.removeTypeHints(opts.fields);
  } else {
    // If a list of fields to join is not given, try to join all the
    // source fields except the key field.
    joinFields = srcTable.getFields();
  }
  if (!opts.force) {
    // only overwrite existing fields if the "force" option is set.
    joinFields = utils.difference(joinFields, destTable.getFields());
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
        val = destRec && destRec[destKey],
        retn = null;
    if (destRec && val in index) {
      retn = index[val];
    }
    return retn;
  };
};

MapShaper.getJoinFilter = function(data, exp) {
  var test =  MapShaper.compileFeatureExpression(exp, {data: data}, null);
  return function(i) {
    var retn = test(i);
    if (retn !== true && retn !== false) {
      stop('[join] "where" expression must return true or false');
    }
    return retn;
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
