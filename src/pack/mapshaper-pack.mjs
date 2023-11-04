import { ArcCollection } from '../paths/mapshaper-arcs';
import { filterVertexData } from '../paths/mapshaper-arc-utils';
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
// opts examples:
//    exporting from command line: { compact: true, file: 'tmp.msx', final: true }
//    exporting from gui export menu: {compact: true, format: 'msx'}
//    saving gui temp snapshot: {compact: false}
export async function exportDatasetsToPack(datasets, opts) {
  var obj = {
    version: 1,
    created: (new Date).toISOString(),
    datasets: await Promise.all(datasets.map(dataset => exportDataset(dataset, opts)))
  };
  return obj;
}

export async function exportDataset(dataset, opts) {
  var arcs = dataset.arcs;
  var arcData = null;
  if (arcs) {
    arcData = arcs.getVertexData();
    arcData.zlimit = arcs.getRetainedInterval(); // TODO: add this to getVertexData()
    arcData = await exportArcData(arcData, opts);
  }
  return {
    arcs: arcData,
    info: dataset.info ? exportInfo(dataset.info) : null,
    layers: await Promise.all((dataset.layers || []).map(exportLayer))
  };
}

// compress unpacked + uncompressed snapshot data in-place
export async function compressSnapshotForExport(obj) {
  var promises = obj.datasets.map(d => {
    compressDatasetForExport(d);
  });
  await Promise.all(promises);
  return;
}

async function compressDatasetForExport(obj) {
  if (!obj.arcs) return;
  var arcData = importArcData(obj.arcs); // convert buffers to typed arrays
  obj.arcs = await exportArcData(arcData, {compact: true}); // re-export to compressed buffers
}

function flattenArcs(arcData) {
  if (arcData.zz && arcData.zlimit) {
    // replace unfiltered arc data with flattened arc data
    arcData = filterVertexData(arcData, arcData.zlimit);
    delete arcData.zz;
  }
  return arcData;
}

async function gzipArcData(obj, opts) {
  var gzipOpts = Object.assign({level: 1, consume: false}, opts);
  var promises = [gzipAsync(obj.nn, gzipOpts), gzipAsync(obj.xx, gzipOpts), gzipAsync(obj.yy, gzipOpts)];
  if (obj.zz) promises.push(gzipAsync(obj.zz, gzipOpts));
  var results = await Promise.all(promises);
  obj.nn = results.shift();
  obj.xx = results.shift();
  obj.yy = results.shift();
  if (obj.zz) obj.zz = results.shift();
}

function importArcData(obj) {
  return {
    nn: new Uint32Array(obj.nn.buffer, 0, obj.nn.length / 4),
    xx: new Float64Array(obj.xx.buffer, 0, obj.xx.length / 8),
    yy: new Float64Array(obj.yy.buffer, 0, obj.yy.length / 8),
    zz: obj.zz ? new Float64Array(obj.zz.buffer, 0, obj.zz.length / 8) : null,
    zlimit: obj.zlimit || 0
  };
}

async function exportArcData(data, opts) {
  // TODO: consider removing arcs that are not referenced by any layer
  if (opts.compact && data.zz) {
    data = flattenArcs(data); // bake in any simplification
  }
  var output = {
    nn: typedArrayToBuffer(data.nn),
    xx: typedArrayToBuffer(data.xx),
    yy: typedArrayToBuffer(data.yy),
    zz: data.zz ? typedArrayToBuffer(data.zz) : null,
    zlimit: data.zlimit || 0
  };
  if (opts.compact && data.zz) {
    await gzipArcData(output);
  }
  return output;
}

function typedArrayToBuffer(arr) {
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
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
