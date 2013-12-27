/* @require mapshaper-common, dbf-writer */


var dataFieldRxp = /^[a-zA-Z_][a-zA-Z_0-9]*$/;

function DataTable(obj) {
  var records;
  if (Utils.isArray(obj)) {
    records = obj;
  } else {
    records = [];
    // integer object: create empty records
    if (Utils.isInteger(obj)) {
      for (var i=0; i<obj; i++) {
        records.push({});
      }
    } else if (obj) {
      error("[DataTable] Invalid constructor argument:", obj);
    }
  }

  this.exportAsDbf = function() {
    return Dbf.exportRecords(records);
  };

  this.getRecords = function() {
    return records;
  };

  this.size = function() {
    return records.length;
  };
}

var dataTableProto = {
  fieldExists: function(name) {
    if (this.size() === 0) return false;
    return name in this.getRecords()[0];
  },

  addField: function(name, init) {
    var useFunction = Utils.isFunction(init);
    if (!Utils.isNumber(init) && !Utils.isString(init) && !useFunction) {
      error("DataTable#addField() requires a string, number or function for initialization");
    }
    if (this.fieldExists(name)) error("DataTable#addField() tried to add a field that already exists:", name);
    if (!dataFieldRxp.test(name)) error("DataTable#addField() invalid field name:", name);

    Utils.forEach(this.getRecords(), function(obj, i) {
      obj[name] = useFunction ? init(obj, i) : init;
    });
  },

  addIdField: function() {
    this.addField('FID', function(obj, i) {
      return i;
    });
  },

  indexOn: function(f) {
    this._index = Utils.indexOn(this.getRecords(), f);
  },

  getIndexedRecord: function(val) {
    return this._index && this._index[val] || null;
  },

  clearIndex: function() {
    this._index = null;
  },

  // TODO: improve
  getFields: function() {
    if (this.size() === 0) return [];
    return Utils.keys(this.getRecords()[0]);
  }
};

Utils.extend(DataTable.prototype, dataTableProto);

// Implements the DataTable api for DBF file data.
// We avoid touching the raw DBF field data if possible. This way, we don't need
// to parse the DBF at all in common cases, like importing a Shapefile, editing
// just the shapes and exporting in Shapefile format.
//
function ShapefileTable(buf) {
  var reader = new DbfReader(buf);
  var table;

  function getTable() {
    if (!table) {
      // export DBF records on first table access
      table = new DataTable(reader.readRows());
      reader = null;
      buf = null; // null out references to DBF data for g.c.
    }
    return table;
  }

  this.exportAsDbf = function() {
    // export original dbf string if records haven't been touched.
    return buf || table.exportAsDbf();
  };

  this.getRecords = function() {
    return getTable().getRecords();
  };

  this.size = function() {
    return reader ? reader.recordCount : table.size();
  };
}

Utils.extend(ShapefileTable.prototype, dataTableProto);

// export for testing
MapShaper.data = {
  DataTable: DataTable,
  ShapefileTable: ShapefileTable
};
