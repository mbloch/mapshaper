
import DbfReader from '../shapefile/dbf-reader';
import Dbf from '../shapefile/dbf-writer';
import { DataTable } from '../datatable/mapshaper-data-table';

export function importDbfTable(src, o) {
  var opts = o || {};
  return new ShapefileTable(src, opts.encoding);
}

// Implements the DataTable api for DBF file data.
// We avoid touching the raw DBF field data if possible. This way, we don't need
// to parse the DBF at all in common cases, like importing a Shapefile, editing
// just the shapes and exporting in Shapefile format.
// TODO: consider accepting just the filename, so buffer doesn't consume memory needlessly.
//
export function ShapefileTable(src, encoding) {
  var reader = new DbfReader(src, encoding),
      altered = false,
      table;

  function getTable() {
    if (!table) {
      // export DBF records on first table access
      table = new DataTable(reader.readRows());
      reader = null;
      src = null; // null out references to DBF data for g.c.
    }
    return table;
  }

  this.exportAsDbf = function(opts) {
    // export original dbf bytes if possible
    // (e.g. if the data attributes haven't changed)
    var useOriginal = !!reader && !altered && !opts.field_order && !opts.encoding;
    if (useOriginal) {
      try {
        // Maximum Buffer in current Node.js is 2GB
        // We fall back to import-export if getBuffer() fails.
        // This may produce a buffer that does not exceed the maximum size.
        return reader.getBuffer();
      } catch(e) {}
    }
    return Dbf.exportRecords(getTable().getRecords(), opts.encoding, opts.field_order);
  };

  this.getReadOnlyRecordAt = function(i) {
    return reader ? reader.readRow(i) : table.getReadOnlyRecordAt(i);
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

  this.isEmpty = function() {
    return reader ? this.size() === 0 : table.isEmpty();
  };

  this.size = function() {
    return reader ? reader.size() : table.size();
  };
}

Object.assign(ShapefileTable.prototype, DataTable.prototype);
