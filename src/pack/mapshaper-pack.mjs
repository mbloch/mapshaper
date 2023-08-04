import { ArcCollection } from '../paths/mapshaper-arcs';
import { DataTable } from '../datatable/mapshaper-data-table';
// import { encode } from "@msgpack/msgpack";
import { pack as encode } from 'msgpackr';
import { crsToProj4 } from '../crs/mapshaper-projections';
import { gzipAsync, gzipSync } from '../io/mapshaper-gzip';
export var PACKAGE_EXT = 'msx';
import { strToU8 } from 'fflate';
import { exportTable2 } from './mapshaper-packed-table';
import utils from '../utils/mapshaper-utils';

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

export async function exportPackedDatasets(datasets, opts) {
  var content = pack(await exportDatasetsToPack(datasets, opts));
  return [{
    content: content,
    filename: opts.file || 'mapshaper_snapshot.' + PACKAGE_EXT
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
export async function exportDatasetsToPack(datasets, opts) {
  var obj = {
    version: 1,
    created: (new Date).toISOString(),
    datasets: await Promise.all(datasets.map(exportDataset))
  };
  if (opts.compact) {
    await applyCompression(obj);
  }
  return obj;
}

export async function applyCompression(obj, opts) {
  var promises = [];
  obj.datasets.forEach(d => {
    if (d.arcs) promises.push(compressArcs(d.arcs, opts));
  });
  await Promise.all(promises);
}

async function compressArcs(obj, opts) {
  var gzipOpts = Object.assign({level: 1, consume: false}, opts);
  var promises = [gzipAsync(obj.nn, gzipOpts), gzipAsync(obj.xx, gzipOpts), gzipAsync(obj.yy, gzipOpts)];
  if (obj.zz) promises.push(gzipAsync(obj.zz, gzipOpts));
  var results = await Promise.all(promises);
  obj.nn = results.shift();
  obj.xx = results.shift();
  obj.yy = results.shift();
  if (obj.zz) obj.zz = results.shift();
}

export async function exportDataset(dataset, opts) {
  return {
    arcs: dataset.arcs ? exportArcs(dataset.arcs) : null,
    info: dataset.info ? exportInfo(dataset.info) : null,
    layers: await Promise.all((dataset.layers || []).map(exportLayer))
  };
}

function typedArrayToBuffer(arr) {
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}

function exportArcs(arcs) {
  var data = arcs.getVertexData();
  return {
    nn: typedArrayToBuffer(data.nn),
    xx: typedArrayToBuffer(data.xx),
    yy: typedArrayToBuffer(data.yy),
    zz: data.zz ? typedArrayToBuffer(data.zz) : null,
    zlimit: arcs.getRetainedInterval()
  };
}

async function exportLayer(lyr) {
  var data = null;
  if (lyr.data) {
    data = await exportTable2(lyr.data);
  }
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

export function exportInfo(info) {
  info = Object.assign({}, info);
  if (info.crs && !info.crs_string && !info.prj) {
    info.crs_string = crsToProj4(info.crs);
  }
  delete info.crs; // proj object cannot be serialized (need to reconstitute in unpack)
  return info;
}
