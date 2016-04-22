/* @requires
dbf-reader
mapshaper-data-table
*/

MapShaper.importDbfTable = function(buf, o) {
  var opts = o || {};
  return new ShapefileTable(buf, opts.encoding);
};

// Implements the DataTable api for DBF file data.
// We avoid touching the raw DBF field data if possible. This way, we don't need
// to parse the DBF at all in common cases, like importing a Shapefile, editing
// just the shapes and exporting in Shapefile format.
// TODO: consider accepting just the filename, so buffer doesn't consume memory needlessly.
//
function ShapefileTable(buf, encoding) {
  var reader = new DbfReader(buf, encoding),
      altered = false,
      table;

  function getTable() {
    if (!table) {
      // export DBF records on first table access
      table = new DataTable(reader.readRows());
      reader = null;
      buf = null; // null out references to DBF data for g.c.
    }
    return table;
  }

  this.exportAsDbf = function(encoding) {
    // export original dbf bytes if records haven't been touched.
    return reader && !altered ? reader.getBuffer() : getTable().exportAsDbf(encoding);
  };

  this.getRecordAt = function(i) {
    return reader ? reader.readRow(i) : table.getRecordAt(i);
  };

  this.deleteField = function(f) {
    if (table) {
      table.deleteField(f);
    } else {
      altered = true;
      reader.deleteField(f);
    }
  };

  this.getRecords = function() {
    return getTable().getRecords();
  };

  this.getFields = function() {
    return reader ? reader.getFields() : table.getFields();
  };

  this.size = function() {
    return reader ? reader.size() : table.size();
  };
}

utils.extend(ShapefileTable.prototype, dataTableProto);
