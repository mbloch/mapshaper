/* @require mapshaper-common, dbf-writer */

function DataTable(arr) {
  var records = arr || [];

  this.exportAsDbf = function() {
    error("DataTable#exportAsDbf() not implemented.");
    return "";
  };

  this.getRecords = function() {
    return records;
  };

  this.size = function() {
    return records.length;
  };

}

// Import, manipulate and export data from a DBF file
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
