import { ArcCollection } from '../paths/mapshaper-arcs';
import { DataTable } from '../datatable/mapshaper-data-table';
import { encode } from "@msgpack/msgpack";

export var PACKAGE_EXT = 'msx';

// session format (including gui state)
/*
{
  version: 1,
  created: 'YYYY-MM-DDTHH:mm:ss.sssZ', // ISO string
  datasets: [],
  gui: {} // see gui-session-snapshot-control.mjs
}
*/

export function exportPackedDatasets(datasets, opts) {
  return [{
    content: pack(exportDatasetsToPack(datasets)),
    filename: opts.file || 'output.' + PACKAGE_EXT
  }];
}

export function pack(obj) {
  // encode options: see https://github.com/msgpack/msgpack-javascript
  // initialBufferSize  number  2048
  // ignoreUndefined boolean false
  return encode(obj, {});
}

// gui: (optional) gui instance
//
export function exportDatasetsToPack(datasets, opts) {
  return {
    version: 1,
    created: (new Date).toISOString(),
    datasets: datasets.map(exportDataset)
  };
}

// TODO..
// export function serializeSession(catalog) {
//   var obj = exportDatasets(catalog.getDatasets());
//   return BSON.serialize(obj);
// }

export function exportDataset(dataset) {
  return {
    arcs: dataset.arcs ? exportArcs(dataset.arcs) : null,
    info: dataset.info ? exportInfo(dataset.info) : null,
    layers: (dataset.layers || []).map(exportLayer)
  };
}

function typedArrayToBuffer(arr) {
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}

function exportArcs(arcs) {
  var data = arcs.getVertexData();
  var obj = {
    nn: typedArrayToBuffer(data.nn),
    xx: typedArrayToBuffer(data.xx),
    yy: typedArrayToBuffer(data.yy)
  };
  return obj;
}

function exportLayer(lyr) {
  return {
    name: lyr.name || null,
    geometry_type: lyr.geometry_type || null,
    shapes: lyr.shapes || null,
    data: lyr.data ? lyr.data.getRecords() : null,
    menu_order: lyr.menu_order || null,
    pinned: lyr.pinned || false,
    active: lyr.active || false
  };
}

function exportInfo(info) {
  // TODO: export CRS
  return info;
}
