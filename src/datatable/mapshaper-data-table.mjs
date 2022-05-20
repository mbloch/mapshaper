import { error } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { copyRecord, findFieldNames } from '../datatable/mapshaper-data-utils';

export function DataTable(obj) {
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
      error("Invalid DataTable constructor argument:", obj);
    }
  }

  this.getRecords = function() {
    return records;
  };

  // Same-name method in ShapefileTable doesn't require parsing the entire DBF file
  this.getReadOnlyRecordAt = function(i) {
    return copyRecord(records[i]); // deep-copies plain objects but not other constructed objects
  };
}

DataTable.prototype = {

  fieldExists: function(name) {
    return utils.contains(this.getFields(), name);
  },

  toString: function() {return JSON.stringify(this);},

  toJSON: function() {
    return this.getRecords();
  },

  addField: function(name, init) {
    var useFunction = utils.isFunction(init);
    if (!utils.isNumber(init) && !utils.isString(init) && !useFunction) {
      error("DataTable#addField() requires a string, number or function for initialization");
    }
    if (this.fieldExists(name)) error("DataTable#addField() tried to add a field that already exists:", name);
    // var dataFieldRxp = /^[a-zA-Z_][a-zA-Z_0-9]*$/;
    // if (!dataFieldRxp.test(name)) error("DataTable#addField() invalid field name:", name);

    this.getRecords().forEach(function(obj, i) {
      obj[name] = useFunction ? init(obj, i) : init;
    });
  },

  getRecordAt: function(i) {
    return this.getRecords()[i];
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
    return findFieldNames(this.getRecords());
  },

  isEmpty: function() {
    return this.getFields().length === 0 || this.size() === 0;
  },

  update: function(f) {
    var records = this.getRecords();
    for (var i=0, n=records.length; i<n; i++) {
      records[i] = f(records[i], i);
    }
  },

  clone: function() {
    // TODO: this could be sped up using a record constructor function
    // (see getRecordConstructor() in DbfReader)
    var records2 = this.getRecords().map(copyRecord);
    return new DataTable(records2);
  },

  size: function() {
    return this.getRecords().length;
  }
};
