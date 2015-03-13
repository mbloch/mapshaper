/* @require mapshaper-common, mapshaper-expressions */

api.importJoinTable = function(file, opts) {
  if (!opts.keys || opts.keys.length != 2) {
    stop("[join] Missing join keys");
  }
  var fieldsWithTypeHints = [opts.keys[1]];
  if (opts.fields) {
    fieldsWithTypeHints = fieldsWithTypeHints.concat(opts.fields);
  }
  if (opts.field_types) {
    fieldsWithTypeHints = fieldsWithTypeHints.concat(opts.field_types);
  }
  var importOpts = utils.defaults({field_types: fieldsWithTypeHints}, opts);
  var lyr = MapShaper.importDataFile(file, importOpts);
  return lyr.data;
};

api.joinAttributesToFeatures = function(lyr, srcTable, opts) {
  var keys = MapShaper.removeTypeHints(opts.keys),
      joinFields = MapShaper.removeTypeHints(opts.fields || []),
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
    joinFields = Utils.difference(srcTable.getFields(), [srcKey]);
  }
  if (!lyr.data || !lyr.data.fieldExists(destKey)) {
    stop("[join] Target layer is missing field:", destKey);
  }
  MapShaper.joinTables(lyr.data, destKey, joinFields, srcTable, srcKey,
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
      filtered = Utils.filter(data.getRecords(), function(rec, i) {
        return compiled(i);
      });
  return new DataTable(filtered);
};
