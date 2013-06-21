/* @requires core, events, arrayutils, table-join */

Opts.copyAllParams(C, { 
  INTEGER: 'integer',
  STRING: 'string',
  DOUBLE: 'double',
  OBJECT: 'object'
});


/**
 * DataTable is a js version of the as3 DataTable class.
 * @constructor
 */
function DataTable() {
  if (arguments.length > 0) {
    var arg0 = arguments[0];
    if (arg0 == null) {
      error("Received empty data object -- check data source");
    }
    // (optional) Initialize table w/ js object.
    if (arg0 && arg0.schema) {
      this.populate(arg0.data || null, arg0.schema);
    }
  }
  else {
    this.__initEmptyTable();
  }
}

Opts.inherit(DataTable, Waiter);


DataTable.validateFieldType = function(raw) {
  raw = raw.toLowerCase();
  var type = C.STRING; // default type
  switch (raw) {
    case 'string':
    case 'str':
      type = C.STRING;
      break;
    case 'int':
    case 'integer':
      type = C.INTEGER;
      break;
    case 'double':
    case 'decimal':
    case 'number':
      type = C.DOUBLE;
      break;
    case 'obj':
    case 'object':
      type = C.OBJECT;
      break;
  }
  return type;
};

DataTable.prototype.toString = function() {
  var str = "[DataTable length:" + this.size() + ", schema:" + Utils.toString(this.schema) + "]";
  return str;
};


DataTable.prototype.handleReadyState = function() {
  this._indexedField && this.indexOnField(this._indexedField); // Build index, if deferred.
};


/**
 * Returns the number of rows in the table.
 */
DataTable.prototype.size = function() {
  return this.length;
};


DataTable.prototype.joinTableByKey = function(localKey, otherTable, otherKey, filter) {
  this.waitFor(otherTable);
  this.addEventListener('ready', callback, this, 999);
  function callback() {
    joinDataTables(this, localKey, otherTable, otherKey, filter);
  };
  return this;
};


/**
 * Import an array of objects and an o(ptional) object of field types
 * @param arr Array of object records (i.e. each property:value is a fieldname:value pair)
 * @param schema Object of field types; each property:value is a fieldname:type pair. Valid types include double, integer, string, object
 */
DataTable.prototype.importObjectRecords = function(arr, schema) {
  if (!arr || arr.length == 0) error("Missing array of data values");
  var rec0 = arr[0];
  if (!Utils.isObject(rec0)) error("Expected an array of objects");

  var fields, types;
  if (schema) {
    types = [];
    fields = [];
    Utils.forEach(schema, function(val, key) {
      types.push(val);
      fields.push(val);
    });
  }
  else {
    fields = Utils.getKeys(rec0);
  }

  return this.importArrayRecords(arr, fields, types);
};


/**
 * Import an array of records.
 * @param arr Array of Objects or Arrays
 * @param fields Array of field names
 * @param types Array of field types (optional).
 */
DataTable.prototype.importArrayRecords = function(arr, fields, types) {
  if (!arr || arr.length == 0) error("Missing array of data values");

  var rec0 = arr[0];
  var fieldIndex;
  if (Utils.isObject(rec0)) {
    fieldIndex = fields;
  }
  else if (Utils.isArray(rec0)) {
    fieldIndex = Utils.map(fields, function(val, i) {
      return i;
    });
  }
  else {
    error("Invalid record type; expected Arrays or Objects");
  }

  // if missing types, try to identify them
  if (!types) {
    types = [];
    Utils.forEach(fieldIndex, function(fieldId, i) {
      var val = rec0[fieldId];
      if (Utils.isString(val)) {
        types.push('string');
      }
      else if (!isNaN(val)) {
        types.push('double');
      }
      else {
        trace("[DataTable.importArrayRecords()] unrecognized type of field:", fields[i], "-- using 'object' type");
        types.push('object');
      }
    });
  }
  else {
    if (types.length != fields.length) error("Mismatched types and fields; types:", types, "fields:", fields);
  }


  var columns = Utils.map(fields, function() {
    return [];
  });

  for (var rid=0, len=arr.length; rid<len; rid++) {
    var rec = arr[rid];
    for (var j=0, numFields = fields.length; j<numFields; j++) {
      columns[j].push(rec[fieldIndex[j]]);
    }
  }

  // generate schema and data objects
  var data = {}, schema = {};
  Utils.forEach(fields, function(fname, i) {
    data[fname] = columns[i];
    schema[fname] = types[i];
  });

  this.populate(data, schema);

  return this;
};

/*
DataTable.prototype.importData = function(loader, parser, filter) {

  var handler = function() {
    var content = parser.parse(loader.data);

    if (filter) {
      var proxy = new DataTable();
      proxy.populate(content.data, content.schema);
      var proxy = proxy.filter(filter);
      content.data = proxy.data;
      content.schema = proxy.schema;
    }

    this.populate(content.data, content.schema);
  };

  loader.addEventListener('ready', handler, this);
  return this;
};
*/

DataTable.prototype.getFields = function() {
  return Utils.getKeys(this.data);
};

DataTable.prototype.__initEmptyTable = function(rawSchema) {
  this.data = {};
  this.length = 0;
  this.schema = {};
  this._rec = new Record(this, -1);
  //this._index = {};
  if (rawSchema) {
    for (var key in rawSchema) {
      if (!rawSchema.hasOwnProperty(key)) {
        continue;
      }

      var type = DataTable.validateFieldType(rawSchema[key]);
      if (!type) {
        trace("[DataTable.__initEmptyTable()] invalid type for field: ", key, ":", rawSchema[key]);
        continue;
      }

      this.schema[key] = type;
      this.data[key] = [];
    }
  }
};


/**
 * Import a dataset into the table.
 *
 * @param {object} data Object containing data arrays, indexed by field name.
 * @param {object} schema Object containing field types, indexed by field name.
 */
DataTable.prototype.populate = function(data, schema) {

  // case: missing a schema object -- error condition.
  if (!schema) error("Missing schema object");

  // case: no date -- initalize empty table
  if (!data) {
    this.__initEmptyTable(schema);
  }

  // case: array of objects (common format for json data)
  // case: array of arrays plus array of fields
  // TODO: detect field types, if schema is missing
  //
  else if (Utils.isArray(data)) {
    this.__initEmptyTable(schema);
    for (var i=0, len=data.length; i<len; i++) {
      this.appendRecordData(data[i]);
    }
  }

  // case: optimal format: one data array per column
  else {
    this.__initEmptyTable();
    var len = 0;
    for (var key in schema) {
      if (!schema.hasOwnProperty(key)) {
        continue;
      }

      // initialize empty table, if data is missing...
      if (!data) {
        this.data[key] = [];
        continue;
      }

      this.schema[key] = DataTable.validateFieldType(schema[key]);

      if (!data[key]) {
        trace("[DataTable.populate()] Missing data for field:", key, "schema:", schema);
        continue;
      }
      var thisLen = data[key].length;
      this.data[key] = data[key];
      if (len > 0 && thisLen != len) {
        trace("[DataTable.populate()] Warning: inconsistent field length. Expected length:", len, "Field name:", key, "Field length:", thisLen);
      }
      else {
        len = thisLen;
      }
    }

    this.length = len;
  }

  if (this.isReady()) {
    // if indexed, rebuild index; TODO: remove redundancy with appendRecordData() (above)
    if (this._indexedField) {
      this.indexOnField(this._indexedField);
    }
    this.dispatchEvent('change');
  }
  else {
    this.startWaiting();
  }

  return this; // for chaining
};


/**
 * Returns a Record pointing to the table with a particular id.
 *
 * @param {number} id Id of the row (Tables are 0-indexed, like arrays).
 * @return {Record} Record.
 */
DataTable.prototype.getRecordById = function(id) {
  this._rec.id = id;
  return this._rec;
};

/**
 * Tests whether the table contains a particular field.
 * @param {string} f Name of a field.
 * @return {boolean} True or false.
 */
DataTable.prototype.fieldExists = function(f) {
  return !!(this.schema && this.schema[f]);
};

DataTable.prototype.getFieldType = function(f) {
  return this.schema[f];
};

/**
 * Returns a Record pointing to the row containing an indexed value.
 *
 * @param {*} v Value in an indexed column.
 * @return {Record} Record pointing to indexed row, or a null record.
 */
DataTable.prototype.getIndexedRecord = function(v, fast) {
  var rec = fast ? this._rec : new Record(this, -1);
  var idx = this._index[v];
  if (idx == null) {
    idx = -1;
  }
  rec.id = idx;
  return rec;
};


/**
 * Indexes the table on the contents of one field.
 * Overwrites any previous index.
 * Assumes the field values are unique.
 *
 * @param {string} fname Name of field to index on.
 */
DataTable.prototype.indexOnField = function(fname) {
  this._indexedField = fname;
  if (!this.isReady()) {
    trace("[DataTable.indexOnField()] Table not READY; deferring indexing.]");
    return;
  }
  this._index = this.__getIndex(fname);
  //return this._index;
};


DataTable.prototype.__getIndex = function(fname) {
  if (!this.fieldExists(fname)) error("Missing field:", fname);
  var index = {};
  var arr = this.data[fname];
  for (var i = 0, len = this.size(); i < len; i++) {
    index[arr[i]] = i;
  }
  return index;
};



/**
 * Returns an array of all data values in a column.
 *
 * @param {string} f Name of field.
 * @return {Array} Column of data.
 */
DataTable.prototype.getFieldData = function(f) {
  var arr = this.data[f];
  return arr ? arr : [];
};

DataTable.prototype.addField = function(f, type, def) {
  var arr = Utils.createArray(this.size(), def);
  this.insertFieldData(f, type, arr);
};

/**
 * TODO: accept function
 */
DataTable.prototype.initField = function(f, val) {
  if (this.fieldExists(f) == false) {
    trace("[DataTAble.initField()] field does not exists:", f);
    return;
  }
  var arr = Utils.createArray(this.size(), val);
  this.insertFieldData(f, this.getFieldType(f), arr);
};

DataTable.prototype.deleteField = function(f) {
  if (this._indexedField == f) {
    this._indexedField = null;
  }
  delete this.schema[f];
  delete this.data[f];
  // If deleting last field, set length to 0
  if (Utils.getKeys(this.schema).length == 0) {
    this.length = 0;
  }
};

/**
 * Insert an array of values into the table.
 * @param {string} f Field name.
 * @param {string} type Field type.
 * @param {Array} arr Array of values.
 */
DataTable.prototype.insertFieldData = function(f, type, arr) {
  type = DataTable.validateFieldType(type);
  this.schema[f] = type;
  this.data[f] = arr;

  if (this.length == 0) {
    this.length == arr.length;
  }
  else if (arr.length != this.length) {
    trace("[DataTable.insertFieldData() Warning: column size mismatch");
  }

  // TODO: add integrity checks
  if (this._indexedField == f) {
    this.indexOnField(f);
  }
};

DataTable.prototype.getNullValueForType = function(type) {
  var nullVal = null;
  if (type == C.INTEGER) {
    nullVal = 0;
  } 
  else if (type == C.STRING) {
    nullVal = '';
  }
  else if (type == C.DOUBLE) {
    nullVal = NaN;
  }
  return nullVal;
};

DataTable.prototype.forEach = function(func, ctx) {
  this.getRecordSet().forEach(func, ctx);
};

DataTable.prototype.appendRecordData = function(obj, niceNull) {
  var dest = this.data;
  var ifield = this._indexedField || void 0;
  for (var fname in dest) {
    var val = obj[fname]; // TODO: validate? convert undefined to null?
    
    if (val === void 0 && niceNull) {
      var type = this.schema[fname];
      val = this.getNullValueForType(type);
      if (type == 'double' && isNaN(val)) {
        val = 0.0; // kludge for olympics graphic; need to fix
      }
    }

    dest[fname].push(val);

    // Update index, if field is indexed.
    if (fname === ifield) {
      this._index[val] = this.length;
    }
  }
  this.length += 1;
  return new Record(this, this.length - 1);
};

/**
 * Insert The output of a function into a column of the table.
 *
 * @param {string} f Field name.
 * @param {string} type Field type, e.g. C.DOUBLE.
 * @param {Function(Record)} func Function object.
 */
DataTable.prototype.insertMappedValues = function(f, type, func, ctx) {
  var arr = this.map(func, ctx);
  this.insertFieldData(f, type, arr);
};

DataTable.prototype.updateField = function(f, func, ctx) {
  if (this.fieldExists(f)) {
    var type = this.getFieldType(f);
    this.insertMappedValues(f, type, func, ctx);
  } else {
    trace("[DataTable.updateField()] Field not found:", f);
  }
}

DataTable.prototype.updateValue = function(f, id, val) {
  // TODO: make safer
  if (id < 0 || id >= this.length || !this.data[f]) {
    error("[DataTable.updateValue()] invalid field or id:", f, id);
  }
  this.data[f][id] = val;
  if (this._indexedField === f) {
    this._index[val] = id;
  }
};

DataTable.prototype.map = function(func, ctx) {
  var arr = [];
  var rec = this._rec;
  for (var rid = 0, len = this.size(); rid < len; rid++) {
    rec.id = rid;
    arr.push(func.call(ctx, rec));
  }
  return arr;
};

DataTable.prototype.insertMappedFields = function(fields, types, func) {
  var numFields = fields.length;
  var dataArr = Utils.createArray(numFields, Array); // Array() returns a new Array, just like new Array()
  var rec = this._rec;
  var tmp = [];
  for (var rid = 0, len = this.size(); rid < len; rid++) {
    rec.id = rid;
    func(rec, tmp);
    for (var j=0, len2=numFields; j<numFields; j++) {
      dataArr[j].push(tmp[j]);
    }
  }

  var schema = Utils.arrayToIndex(fields, types);
  var data = Utils.arrayToIndex(fields, dataArr);
  this.populate(data, schema);
};


/**
 * Get a RecordSet containing all rows.
 * @return {RecordSet} RecordSet object.
 */
DataTable.prototype.getRecordSet = function() {
  var ids = Utils.range(this.size());
  return new RecordSet(this, ids);
};

DataTable.prototype.records = DataTable.prototype.getRecordSet;

/**
 * Wrapper for getMatchingRecordSet that returns a single Record object.
 * @return {Record} Matching record or null record.
 */
DataTable.prototype.getMatchingRecord = function() {
  var set = this.getMatchingRecordSet.apply(this, arguments);
  var rec = set.hasNext() ? set.nextRecord : new Record(null, -1);
  return rec;
};


DataTable.prototype.filter = function(func, ctx) {
  return this.getFilteredCopy(this.getRecordSet().filter(func, ctx).getIds());
};

DataTable.prototype.copyFields = function(fields) {
  var src = this;
  var dest = new DataTable();
  Utils.forEach(fields, function(f) {
    if (!src.fieldExists(f)) {
      trace("[DataTable.copyFields()] Missing field:", f);
      return;
    }
    dest.insertFieldData(f, src.getFieldType(f), src.getFieldData(f));
  });

  return dest.startWaiting();
};

/*
DataTable.prototype.getFilteredCopy = function(ids) {
  var dest = {};
  var schema = {};
  Opts.copyAllParams(schema, this.schema);
  
  var newLen = ids.length;
  var src = this.data;
  for (var fname in src) {
    if (!src.hasOwnProperty(fname)) {
      continue;
    }
    var oldArr = src[fname];
    var newArr = [];
    dest[fname] = newArr;

    for (var i=0; i<newLen; i++) {
      var oldId = ids[i];
      newArr.push(oldArr[oldId]);
    }
  }

  var newTable = new DataTable();
  newTable.populate(dest, schema);
  if (this._indexedField) {
    newTable.indexOnField(this._indexedField);
  }
  return newTable;
};
*/

DataTable.prototype.getFilteredCopy = function(ids) {
  var schema = Opts.copyAllParams({}, this.schema);
  
  var newLen = ids.length;
  var dest = Utils.map(this.data, function(arr, key) {
    return Utils.getFilteredCopy(arr, ids);
  });

  var newTable = new DataTable().populate(dest, schema);
  if (this._indexedField) {
    newTable.indexOnField(this._indexedField);
  }
  return newTable;
};

/**
 *  @param f Field name
 *  @param v Field value or array of values
 *
 */
DataTable.prototype.getMatchingIds = function(f, v, ids) {
  /*
  if (Utils.isArray(v)) {
    trace("[DataTable.getMatcingIds()] Arrays no longer accepted.");
    throw "TypeError";
  }
  */
  var matching = [],
    data = this.getFieldData(f),
    func = typeof v == 'function',
    indexed = !!ids,
    matchArr = Utils.isArray(v),
    len = indexed ? ids.length : this.size();

  for (var i=0; i<len; i++) {
    var idx = indexed ? ids[i] : i;
    var val = data[idx];
    if (matchArr) {
      Utils.indexOf(v, val) != -1 && matching.push(idx);
    }
    else if (func ? v(val) : val === v) {
      matching.push(idx);
    }
  }
  return matching;
};


DataTable.prototype.getMatchingRecordSet = function() {
  var ids, f, v;

  for (var i=0; i<arguments.length; i+= 2) {
    f = arguments[i];
    v = arguments[i+1];
    ids = this.getMatchingIds(f, v, ids);
  }

  return new RecordSet(this, ids || []);
};




/**
 * An iterator class containing a subset of rows in a DataTable.
 * @constructor
 * @param {DataTable} table DataTable.
 * @param {Array} ids Array of ids of each record in the RecordSet.
 */
function RecordSet(table, ids) {
  this._idx = 0;
  this.nextRecord = new Record(table, -1);

  this.size = function() {
    return ids.length;
  };

  this.hasNext = function() {
    if (this._idx >= ids.length) {
      this.nextRecord.id = -1;
      this._idx = 0;
      return false;
    }
    this.nextRecord.id = ids[this._idx++];
    return true;
  };

  this.getIds = function() {
    return ids;
  };

  this.getFieldData = function(f) {
    var o = [];
    var data = table.getFieldData(f);
    for (var i=0, len=ids.length; i<len; i++) {
      o.push(data[ids[i]]);
    }
    return o;
  };

  this.sortOnField = function(f, asc) {
    Utils.sortArrayIndex(ids, table.getFieldData(f), asc);
    return this;
  };

  this.filter = function(func, ctx) {
    var rec = new Record(table, -1);
    var oldIds = ids.splice(0, ids.length);
    for (var i=0, len=oldIds.length; i<len; i++) {
      var id = oldIds[i];
      rec.id = id;
      func.call(ctx, rec) && ids.push(id);
    }
    return this;
  };

  this.forEach = function(func, ctx) {
    var i = 0;
    while(this.hasNext()) {
      func.call(ctx, this.nextRecord, i++);
    }
  };

  this.toTable = function() {
    return table.getFilteredCopy(ids);
  };
}



/**
 * A cursor with access to one row of a DataTable.
 *
 * @param {DataTable} table DataTable object.
 * @param {number} rid Id of a row in a DataTable.
 */
function Record(table, rid) {
  this.id = rid;
  this._table = table;
  this._data = table ? table.data : {}; // assume data is never replaced.
}

function NullRecord() {
  this.__super__(null, -1);
}

Opts.inherit(NullRecord, Record);

/**
 * Return a string representation, for debugging.
 * @return {string} String.
 */
Record.prototype.toString = function() {
  var obj = this.getDataAsObject();
  obj.id = this.id;
  return "[Record" + Utils.strval(obj) + "]";
};



/**
 * Test if record is null / points to a valid table row.
 * @return {boolean} True or false.
 */
Record.prototype.isNull = function() {
  return this.id < 0;
};


/**
 * Return a new Record pointing to the same table row as this one.
 * @return {Record} Cloned record.
 */
Record.prototype.clone = function() {
  return new Record(this._table, this.id);
};


/**
 * Return value of a string (C.STRING) field.
 * @param {string} f Field name.
 * @return {string} String value.
 */
Record.prototype.getString = function(f) {
  return this.get(f) || '';
};


/**
 * Return value of a number (C.DOUBLE) field.
 * @param {string} f Field name.
 * @return {number} Numeric value.
 */
Record.prototype.getNumber = function(f) {
  return this.get(f) * 1.0;
};


/**
 * Get value of an integer field (or coerce other type to integer).
 * @param {string} f Field name.
 * @return {number} Integer value.
 */
Record.prototype.getInteger = function(f) {
  return this.get(f) << 0;
};


/**
 * Return a data value of any type.
 * @param {string} f Field name.
 * @return {*} Data of any type.
 */
Record.prototype.get = function(f) {
  var arr = this._data[f];
  var val = arr && arr[this.id];
  return val;
};

Record.prototype.set = function(f, v) {
  // TODO: Make safer. Validate field name, object type, record index.
  /*
  var arr = this._data[f]; // this._table.getFieldData(f);
  if (arr) {
    arr[this.id] = v;
  }
  */
  this._table.updateValue(f, this.id, v);
};


/**
 * Fetches all the data from a Record.
 * Optionally copy data into passed-in object, to avoid {} overhead.
 *
 * @param {object=} objRef Optional parameter.
 * @return {object} Object containing record data, indexed by field name.
 */
Record.prototype.getDataAsObject = function(objRef) {
  var obj = objRef || {};
  Utils.forEach(this._data, function(val, key) {
    obj[key] = val[this.id];
  }, this);
  return obj;
};
