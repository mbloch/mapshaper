/* @require mapshaper-common, dbf-writer */

var dataFieldRxp = /^[a-zA-Z_][a-zA-Z_0-9]*$/;

function DataTable(obj) {
  var records;
  if (utils.isArray(obj)) {
    records = obj;
  } else {
    records = [];
    // integer object: create empty records
    if (utils.isInteger(obj)) {
      for (var i=0; i<obj; i++) {
        records.push({});
      }
    } else if (obj) {
      error("[DataTable] Invalid constructor argument:", obj);
    }
  }

  this.exportAsDbf = function(encoding) {
    return Dbf.exportRecords(records, encoding);
  };

  this.getRecords = function() {
    return records;
  };
}

var dataTableProto = {
  fieldExists: function(name) {
    return utils.contains(this.getFields(), name);
  },

  exportAsJSON: function() {
    return JSON.stringify(this.getRecords());
  },

  addField: function(name, init) {
    var useFunction = utils.isFunction(init);
    if (!utils.isNumber(init) && !utils.isString(init) && !useFunction) {
      error("DataTable#addField() requires a string, number or function for initialization");
    }
    if (this.fieldExists(name)) error("DataTable#addField() tried to add a field that already exists:", name);
    if (!dataFieldRxp.test(name)) error("DataTable#addField() invalid field name:", name);

    this.getRecords().forEach(function(obj, i) {
      obj[name] = useFunction ? init(obj, i) : init;
    });
  },

  addIdField: function() {
    this.addField('FID', function(obj, i) {
      return i;
    });
  },

  deleteField: function(f) {
    this.getRecords().forEach(function(o) {
      delete o[f];
    });
  },

  getFields: function() {
    var records = this.getRecords();
    return records.length > 0 ? Object.keys(records[0]) : [];
  },

  update: function(f) {
    var records = this.getRecords();
    for (var i=0, n=records.length; i<n; i++) {
      records[i] = f(records[i], i);
    }
  },

  clone: function() {
    var records2 = this.getRecords().map(function(rec) {
      return utils.extend({}, rec);
    });
    return new DataTable(records2);
  },

  size: function() {
    return this.getRecords().length;
  }
};

utils.extend(DataTable.prototype, dataTableProto);

// export for testing
MapShaper.DataTable = DataTable;
