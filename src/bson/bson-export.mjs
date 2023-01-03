import { ArcCollection } from '../paths/mapshaper-arcs';
import { DataTable } from '../datatable/mapshaper-data-table';

export function exportBSON(datasets, opts) {
  var { serialize } = require('bson');
  var obj = exportDatasets(datasets);
  var content = serialize(obj);
  return [{
    content: content,
    filename: opts.file || 'output.mshp'
  }];
}

// gui: (optional) gui instance
//
export function exportDatasets(datasets) {
  // TODO: add targets
  // TODO: add gui state
  return {
    version: 1,
    datasets: datasets.map(exportDataset)
  };
}

// TODO..
// export function serializeSession(catalog) {
//   var obj = exportDatasets(catalog.getDatasets());
//   return BSON.serialize(obj);
// }

export function exportDataset(dataset) {
  return Object.assign(dataset, {
    arcs: dataset.arcs ? exportArcs(dataset.arcs) : null,
    info: dataset.info ? exportInfo(dataset.info) : null,
    layers: (dataset.layers || []).map(exportLayer)
  });
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
    data: lyr.data ? lyr.data.getRecords() : null
  };
}

function exportInfo(info) {
  // TODO: export CRS
  return info;
}
