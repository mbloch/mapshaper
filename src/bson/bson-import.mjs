import { ArcCollection } from '../paths/mapshaper-arcs';
import { DataTable } from '../datatable/mapshaper-data-table';
import { stop } from '../utils/mapshaper-logging';
import { BinArray } from '../utils/mapshaper-binarray';

// Import datasets contained in a BSON blob
// Return command target as a dataset
//
export function importBSON(buf) {
  var { deserialize } = require('bson');
  var obj = deserialize(buf, {
    promoteBuffers: true,
    promoteValues: true
  });
  if (!isValidSession(obj)) {
    stop('Invalid mapshaper session data object');
  }

  var datasets = obj.datasets.map(importDataset);
  var target = datasets[0]; // TODO: improve
  return {
    datasets: datasets,
    target: target
  };
}

function isValidSession(obj) {
  if (!Array.isArray(obj.datasets)) {
    return false;
  }
  return true;
}

function importDataset(obj) {
  return {
    info: obj.info,
    layers: (obj.layers || []).map(importLayer),
    arcs: obj.arcs ? importArcs(obj.arcs) : null
  };
}

function bufferToDataView(buf, constructor) {
  return new constructor(BinArray.copyToArrayBuffer(buf));
  // this doesn't work: "RangeError: start offset of Float64Array should be a multiple of 8"
  // return new constructor(buf.buffer, buf.byteOffset, buf.byteLength);
}

function importArcs(obj) {
  var nn = bufferToDataView(obj.nn, Uint32Array);
  var xx = bufferToDataView(obj.xx, Float64Array);
  var yy = bufferToDataView(obj.yy, Float64Array);
  var arcs = new ArcCollection(nn, xx, yy);
  return arcs;
}

function importLayer(lyr) {
  return Object.assign(lyr, {
    data: lyr.data ? new DataTable(lyr.data) : null
  });
}