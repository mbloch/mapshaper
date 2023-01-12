import { ArcCollection } from '../paths/mapshaper-arcs';
import { DataTable } from '../datatable/mapshaper-data-table';
// import { encode } from "@msgpack/msgpack";
import { pack } from 'msgpackr';
import { crsToProj4 } from '../crs/mapshaper-projections';
import { gzipSync, gzipAsync, gunzipSync, isGzipped } from '../io/mapshaper-gzip';
export var PACKAGE_EXT = 'msx';
import { strToU8, strFromU8 } from 'fflate';
import { getColumnType, getFieldValues } from '../datatable/mapshaper-data-utils';
import { error, stop } from '../utils/mapshaper-logging';

/*
Option A (@msgpack/msgpack): 3307ms in Chrome, 1229ms in Firefox
encode(table.getRecords())

Option B (@msgpack/msgpack): 490ms in Chrome, 217ms in Firefox
encode(JSON.stringify(table.getRecords())

Option C (msgpackr): 330ms in Chrome, 169ms in Firefox
pack(table.getRecords())

Option D (msgpackr): 186ms in Chrome,124ms in Firefox
pack(JSON.stringify(table.getRecords())
*/

export function exportTable(table) {
  var opts = {level: 2}; // default of 6 gives little additional benefit, is slower
  return gzipSync(strToU8(JSON.stringify(table.getRecords())), opts);
}

// Export in a column-first format
// Faster than exportTable(), and can handle some data that can't be
// converted to JSON, like Date objects.
export async function exportTable2(table) {
  var fields = table.getFields();
  var records = table.getRecords();
  var types = [];
  var columns = await Promise.all(fields.map(function(name) {
    var type = getColumnType(name, records);
    types.push(type);
    return exportColumn(name, type, records);
  }));
  return ({
    fields: fields,
    types: types,
    data: columns,
    size: records.length
  });
}

// Returns array of records
export function importTable(data) {
  if (looksLikeType2Table(data)) {
    return importTable2(data);
  }
  if (isGzipped(data)) {
    return JSON.parse(strFromU8(gunzipSync(data)));
  }
  if (Array.isArray(data)) {
    return data;
  }
  error('Unknown packed table format');
}

function looksLikeType2Table(o) {
  return Array.isArray(o.fields) &&
    Array.isArray(o.types) && Array.isArray(o.data) &&
    o.fields.length == o.types.length && o.fields.length == o.data.length &&
    o.size >= 0;
}

function importTable2(obj) {
  var n = obj.size;
  var records = [];
  for (var i=0; i<n; i++) {
    records[i] = {};
  }
  for (var j=0, m=obj.fields.length; j<m; j++) {
    importColumn(obj.fields[j], obj.types[j], obj.data[j], records);
    obj.data[j] = null;
  }
  return records;
}

function importColumn(field, type, data, records) {
  var arr, rec;
  if (isGzipped(data)) {
    arr = JSON.parse(strFromU8(gunzipSync(data)));
  } else if (Array.isArray(data)) {
    arr = data;
  } else {
    error('Unexpected packed table format');
  }
  for (var i=0, n=records.length; i<n; i++) {
    rec = records[i];
    rec[field] = arr[i];
  }
}

async function exportColumn(name, type, records) {
  if (type == 'number' || type == 'string') {
    return gzipAsync(JSON.stringify(getFieldValues(records, name)), {level: 2, consume: true});
  }
  return getFieldValues(records, name);
}

// faster for decimal numbers?
// function exportNumberField(field, records) {
//   var arr = new Float64Array(records.length);
//   for (var i=0, n=records.length; i<n; i++) {
//     arr[i] = records[i][field];
//   }
//   return gzipSync(arr, {level: 2});
// }
