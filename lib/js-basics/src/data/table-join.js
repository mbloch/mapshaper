/** // required by DataTable */


function joinDataTables(dest, destKey, src, srcKey, srcFilter) {
  if (!dest.isReady() || !src.isReady()) {
    trace("[JoinedTable.joinTables()] Source or destination table is not ready; src:", src.isReady(), "dest:", dest.isReady());
    return;
  }

  if (!dest.fieldExists(destKey)) {
    trace("[JoinedTable.joinTable()] destination table is missing its key field: ", destKey);
    return;    
  }
  
  if (!src.fieldExists(srcKey)) {
    trace("[JoinedTable.joinTable()] source table is missing its key field:", srcKey);
    return;
  }

  var filtered = srcFilter && typeof srcFilter == 'function';
  var destSchema = dest.schema;
  var srcSchema = src.schema;
  var destLen = dest.size();
  var srcLen = src.size();

  var keyArr = Utils.getKeys(srcSchema);
  //keyArr = Utils.filter(keyArr, function(val) { return !(val in destSchema)});
  keyArr = Utils.filter(keyArr, function(fieldName) { return !(fieldName == destKey)});

  var fieldCount = keyArr.length;
  var destDataArr = Utils.createArray(fieldCount, function() {return new Array(destLen);});
  var srcDataArr = Utils.map(keyArr, function(key) {return src.getFieldData(key);});

  var index = dest.__getIndex(destKey);
  var srcKeyArr = src.getFieldData(srcKey);
  var lookup = new Array(destLen);

  var filterRec = src.getRecordById(0);
  for (var i=0; i<srcLen; i++) {
    if (filtered) {
      filterRec.id = i;
      if (!srcFilter(filterRec)) {
        continue;
      }
    }
    var val = srcKeyArr[i];
    var destId = index[val];
    lookup[i] = destId; //  === undefined ? -1 : destId;
  }

  for (var i=0; i<fieldCount; i++) {
    var destArr = destDataArr[i];
    var srcArr = srcDataArr[i];
    for (var j=0; j<srcLen; j++) {
      var destId = lookup[j];
      if (destId !== undefined) {
        destArr[destId] = srcArr[j];
      }
    }
  }

  var schema = {};
  var data = {};
  Opts.copyAllParams(schema, destSchema);
  Opts.copyAllParams(data, dest.data);

  Opts.copyNewParams(schema, srcSchema);
  Opts.copyAllParams(data, Utils.arrayToIndex(keyArr, destDataArr));

  dest.populate(data, schema);
};

/*

JoinedTable.prototype.joinTablesV1 = function(dest, destKey, src, srcKey) {
  if (!dest.fieldExists(destKey) || !src.fieldExists(srcKey)) {
    trace("[JoinedTable] missing one or more key fields:", srcKey, destKey);
    return;
  }
  
  var destSchema = dest.schema;
  var srcSchema = src.schema;
  
  var keyArr = Utils.getKeys(srcSchema);

  keyArr = Utils.filter(keyArr, function(val) { return !(val in destSchema)});

  var fieldCount = keyArr.length;
  var destDataArr = Utils.createArray(fieldCount, Array);
  var srcDataArr = Utils.map(keyArr, function(key) {return src.getFieldData(key);});

  var nullVal = null;
  var index = src.indexOnField(srcKey);
  var destKeyData = dest.getFieldData(destKey);

  for (var i=0, len=destKeyData.length; i<len; i++) {
    var destVal = destKeyData[i];
    var srcId = index[destVal];
    var isNull = srcId === undefined;
    for (var j=0; j<fieldCount; j++) {
      destDataArr[j].push( isNull ? nullVal : srcDataArr[j][srcId]);
    }
  }


  var schema = {};
  var data = {};
  Opts.copyAllParams(schema, destSchema);
  Opts.copyAllParams(data, dest.data);

  Opts.copyNewParams(schema, srcSchema);
  Opts.copyAllParams(data, Utils.arrayToIndex(keyArr, destDataArr));

  this.populate(data, schema);

  //trace("[destData]", destDataArr[0]);

};

*/