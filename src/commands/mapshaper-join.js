/* @require mapshaper-common, mapshaper-expressions */

api.importJoinTable = function(file, opts) {
  if (!opts.keys || opts.keys.length != 2) {
    stop("[join] Missing join keys");
  }
  var importOpts = utils.defaults({
    fields: (opts.fields || []).concat(opts.keys[1])
  }, opts);
  return MapShaper.importDataTable(file, importOpts);
};

api.joinAttributesToFeatures = function(lyr, table, opts) {
  var keys = MapShaper.removeTypeHints(opts.keys),
      joinFields = MapShaper.removeTypeHints(opts.fields || []),
      destKey = keys[0],
      srcKey = keys[1];

  if (table.fieldExists(srcKey) === false) {
    stop("[join] External table is missing a field named:", srcKey);
  }

  if (opts.where) {
    table = MapShaper.filterDataTable(table, opts.where);
  }

  if (joinFields.length > 0 === false) {
    joinFields = Utils.difference(table.getFields(), [srcKey]);
  }

  if (!lyr.data || !lyr.data.fieldExists(destKey)) {
    stop("[join] Target layer is missing field:", destKey);
  }

  if (!MapShaper.joinTables(lyr.data, destKey, joinFields, table, srcKey,
      joinFields)) {
    stop("[join] No records could be joined");
    // TODO: better handling of failed joins
  }
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

MapShaper.filterDataTable = function(data, exp) {
  var compiled = MapShaper.compileFeatureExpression(exp, {data: data}, null),
      filtered = Utils.filter(data.getRecords(), function(rec, i) {
        return compiled(i);
      });
  return new DataTable(filtered);
};
