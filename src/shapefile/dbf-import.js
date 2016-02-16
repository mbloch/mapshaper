/* @requires
dbf-reader
mapshaper-data-table
*/

MapShaper.importDbfTable = function(buf, opts) {
  return new ShapefileTable(buf, opts && opts.encoding);
};

// Implements the DataTable api for DBF file data.
// We avoid touching the raw DBF field data if possible. This way, we don't need
// to parse the DBF at all in common cases, like importing a Shapefile, editing
// just the shapes and exporting in Shapefile format.
// TODO: consider accepting just the filename, so buffer doesn't consume memory needlessly.
//
function ShapefileTable(buf, encoding) {
  var reader = new DbfReader(buf, encoding),
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
    // export original dbf string if records haven't been touched.
    return table ? table.exportAsDbf(encoding) : reader.bin.buffer();
  };

  this.getRecords = function() {
    return getTable().getRecords();
  };

  this.getFields = function() {
    return reader ? utils.pluck(reader.header.fields, 'name') : table.getFields();
  };

  this.size = function() {
    return reader ? reader.rows() : table.size();
  };
}

utils.extend(ShapefileTable.prototype, dataTableProto);
MapShaper.ShapefileTable = ShapefileTable;
