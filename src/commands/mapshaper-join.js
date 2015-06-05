/* @require mapshaper-common, mapshaper-expressions, mapshaper-dbf-table, mapshaper-delim-import */

api.join = function(targetLyr, dataset, opts) {
  var srcTable = MapShaper.getJoinSource(dataset, opts);
  api.joinAttributesToFeatures(targetLyr, srcTable, opts);
};

// Get a DataTable to join, either from a current layer or from a file.
MapShaper.getJoinSource = function(dataset, opts) {
  var layers = MapShaper.findMatchingLayers(dataset.layers, opts.source),
      table;
  if (layers.length > 0) {
    table = layers[0].data;
  } else {
    table = api.importJoinTable(opts.source, opts);
  }
  return table;
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
  var dataset = api.importFile(file, importOpts);
  return dataset.layers[0].data;
};

// TODO: think through how best to deal with identical field names
api.joinAttributesToFeatures = function(lyr, srcTable, opts) {
  if (!opts.keys || opts.keys.length != 2) {
    stop("[join] Missing join keys");
  }
  var keys = MapShaper.removeTypeHints(opts.keys),
      joinFields = MapShaper.removeTypeHints(opts.fields || []),
      destTable = lyr.data,
      destKey = keys[0],
      srcKey = keys[1],
      matches;

  if (srcTable.fieldExists(srcKey) === false) {
    stop("[join] External table is missing a field named:", srcKey);
  }
  if (opts.where) {
    srcTable = MapShaper.filterDataTable(srcTable, opts.where);
  }
  if (joinFields.length > 0 === false) {
    // If a list of join fields is not available, try to join all the
    // source fields except the key field.
    joinFields = utils.difference(srcTable.getFields(), [srcKey]);
    // ... but only overwrite existing fields if the "force" option is set.
    if (!opts.force) {
      joinFields = utils.difference(joinFields, destTable.getFields());
    }
  }
  if (!destTable || !destTable.fieldExists(destKey)) {
    stop("[join] Target layer is missing key field:", destKey);
  }
  MapShaper.joinTables(destTable, destKey, joinFields, srcTable, srcKey,
      joinFields);
};


// Join fields from src table to dest table, using values in src and dest key fields
// Returns number of records in dest that receive data from src
// TODO: consider using functions to access or generate key values, for greater flexibility
MapShaper.joinTables = function(dest, destKey, destFields, src, srcKey, srcFields) {
  var records = dest.getRecords(),
      unmatchedKeys = [];
  src.indexOn(srcKey);
  records.forEach(function(destRec, i) {
    var joinVal = destRec[destKey],
        srcRec = src.getIndexedRecord(joinVal),
        srcField;

    if (!srcRec) {
      srcRec = {}; // null record
      unmatchedKeys.push(joinVal);
    }
    for (var j=0, n=srcFields.length; j<n; j++) {
      srcField = srcFields[j];
      // Use null when the source record is missing an expected value
      // TODO: decide if this is desirable
      destRec[destFields[j]] = Object.prototype.hasOwnProperty.call(srcRec, srcField) ? srcRec[srcField] : null;
    }
  });

  if (unmatchedKeys.length > 0) {
    if (unmatchedKeys.length == records.length) {
      stop("[join] No records could be joined");
    } else {
      message(utils.format("[join] Unable to join %d/%d records (use -verbose to see unmatched values)",
          unmatchedKeys.length, records.length));
      if (MapShaper.VERBOSE) {
        verbose(utils.format("Unmatched key values: %s", unmatchedKeys.join(', ')));
      }
    }
  }
};

MapShaper.filterDataTable = function(data, exp) {
  var compiled = MapShaper.compileFeatureExpression(exp, {data: data}, null),
      filtered = data.getRecords().filter(function(rec, i) {
        return compiled(i);
      });
  return new DataTable(filtered);
};
