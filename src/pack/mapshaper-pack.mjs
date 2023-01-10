import { ArcCollection } from '../paths/mapshaper-arcs';
import { DataTable } from '../datatable/mapshaper-data-table';
// import { encode } from "@msgpack/msgpack";
import { pack as encode } from 'msgpackr';
import { crsToProj4 } from '../crs/mapshaper-projections';
// import { gzipSync, isGzipped } from '../io/mapshaper-gzip';
export var PACKAGE_EXT = 'msx';
import { strToU8 } from 'fflate';
import { exportTable2 } from './mapshaper-packed-table';

// libraries
// https://msgpack.org/index.html
//

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
    yy: typedArrayToBuffer(data.yy),
    zz: data.zz ? typedArrayToBuffer(data.zz) : null,
    zlimit: arcs.getRetainedInterval()
  };

  // gzipping typically only sees about 70% compression on unrounded coordinates
  // -- not worth the time
  // var obj2 = {
  //   nn: gzipSync(obj.nn),
  //   xx: gzipSync(obj.xx),
  //   yy: gzipSync(obj.yy)
  // }
  return obj;
}

function exportLayer(lyr) {
  // console.time('table')
  var data = lyr.data ? exportTable2(lyr.data) : null;
  // console.timeEnd('table')
  return {
    name: lyr.name || null,
    geometry_type: lyr.geometry_type || null,
    shapes: lyr.shapes || null,
    data: data,
    menu_order: lyr.menu_order || null,
    pinned: lyr.pinned || false,
    active: lyr.active || false
  };
}

function exportInfo(info) {
  info = Object.assign({}, info);
  if (info.crs && !info.crs_string && !info.prj) {
    info.crs_string = crsToProj4(info.crs);
  }
  delete info.crs; // proj object cannot be serialized (need to reconstitute in unpack)
  return info;
}
