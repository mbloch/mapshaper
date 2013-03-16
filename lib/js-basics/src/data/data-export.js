/* @requires data, json2 */

var DataExport = {
  exportTable: function(t) {
    if (!t.isReady()) {
      return {};
    }

    var schema = t.schema;
    var data = t.data;
    var obj = {schema:schema, data:data};
    return obj;
  },

  exportTableAsArray: function(t) {
    var arr = [];
    var set = t.getRecordSet();
    while(set.hasNext()) {
      arr.push(set.nextRecord.getDataAsObject());
    }
    return arr;
  },

  serializeTable: function(t) {
    var obj = this.exportTable(t);
    return JSON.stringify(obj);
  },

  serializeToNamespace: function(t, ns) {
    var parts = ns.split('.');
    var js = "";
    for (var i=0, len=parts.length - 1; i<len; i++) {
      var part = parts[i];
      if (i == 0) {
        var left = part;
        var right = "window." + part;
      }
      else {
        left += "." + part;
        right = left;
      }
      js += left + " = " + right + " || {};\n";
    }
    js += ns + " = " + this.serializeTable(t) + ";";
    return js;
  }

};

