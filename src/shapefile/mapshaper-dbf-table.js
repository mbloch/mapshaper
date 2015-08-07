/* @requires mapshaper-data-table, dbf-reader, mapshaper-path-utils */


MapShaper.importDbfTable = function(buf, opts) {
  return new ShapefileTable(buf, opts && opts.encoding);
};

MapShaper.exportDbf = function(dataset, opts) {
  return dataset.layers.reduce(function(files, lyr) {
    if (lyr.data) {
      files = files.concat(MapShaper.exportDbfFile(lyr, dataset, opts));
    }
    return files;
  }, []);
};

MapShaper.exportDbfFile = function(lyr, dataset, opts) {
  var data = lyr.data,
      buf;
  // create empty data table if missing a table or table is being cut out
  if (!data || opts.cut_table || opts.drop_table) {
    data = new DataTable(lyr.shapes.length);
  }
  // dbfs should have at least one column; add id field if none
  if (data.getFields().length === 0) {
    data.addIdField();
  }
  buf = data.exportAsDbf(opts.encoding || 'utf8');
  if (utils.isInteger(opts.ldid)) {
    new Uint8Array(buf)[29] = opts.ldid; // set language driver id
  }
  // TODO: also export .cpg page
  return [{
    content: buf,
    filename: lyr.name + '.dbf'
  }];
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
