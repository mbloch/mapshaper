/* @require mapshaper-common */


MapShaper.importJoinTable = function(file, opts, done) {
  MapShaper.importTableAsync(file, function(table) {
    var fields = opts.join_fields || table.getFields(),
        keys = opts.join_keys;
    if (!Utils.isArray(keys) || keys.length != 2) {
      error("importJointTable() Invalid join keys:", keys);
    }
    // this may cause duplicate field name with inconsistent type hints
    // adjustRecordTypes() should handle this case
    fields.push(opts.join_keys[1]);
    // convert data types based on type hints and numeric csv fields
    // SIDE EFFECT: type hints are removed from field names
    fields = MapShaper.adjustRecordTypes(table.getRecords(), fields);
    // replace foreign key in case original contained type hint
    opts.join_keys[1] = fields.pop();
    opts.join_fields = fields;
    done(table);
  }, opts);
};

MapShaper.joinTableToLayers = function(layers, table, keys, joinFields) {
  var localKey = keys[0],
      foreignKey = keys[1],
      typeIndex = {};
  T.start();
  if (table.fieldExists(foreignKey) === false) {
    stop("[join] External table is missing a field named:", foreignKey);
  }

  if (!joinFields || joinFields.length === 0) {
    joinFields = Utils.difference(table.getFields(), [foreignKey]);
  }

  var joins = 0,
      index = Utils.indexOn(table.getRecords(), foreignKey);

  Utils.forEach(layers, function(lyr) {
    if (lyr.data && lyr.data.fieldExists(localKey)) {
      if (MapShaper.joinTables(lyr.data, localKey, joinFields,
          table, foreignKey, joinFields)) {
        joins++;
      }
    }
  });

  if (joins === 0) {
    // TODO: better handling of failed joins
    stop("[join] Join failed");
  }
  T.stop("Join");
};

MapShaper.joinTables = function(dest, destKey, destFields, src, srcKey, srcFields) {
  var hits = 0, misses = 0,
      records = dest.getRecords(),
      len = records.length,
      destField, srcField,
      unmatched = [],
      nullRec = Utils.newArray(destFields.length, null),
      destRec, srcRec, joinVal;
  src.indexOn(srcKey);

  for (var i=0; i<len; i++) {
    destRec = records[i];
    joinVal = destRec[destKey];
    srcRec = src.getIndexedRecord(joinVal);
    if (!srcRec) {
      misses++;
      if (misses <= 10) unmatched.push(joinVal);
      srcRec = nullRec;
    } else {
      hits++;
    }
    for (var j=0, n=srcFields.length; j<n; j++) {
      destRec[destFields[j]] = srcRec[srcFields[j]] || null;
    }
  }
  if (misses > 0) {
    var msg;
    if (misses > 10) {
      msg = Utils.format("Unable to join %d records", misses);
    } else {
      msg = Utils.format("Unjoined values: %s", Utils.uniq(unmatched).join(', '));
    }
    message(msg);
  }

  return hits > 0;
};
