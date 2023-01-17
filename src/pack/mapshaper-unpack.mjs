import { ArcCollection } from '../paths/mapshaper-arcs';
import { DataTable } from '../datatable/mapshaper-data-table';
import { stop } from '../utils/mapshaper-logging';
import { BinArray } from '../utils/mapshaper-binarray';
// import { decode } from "@msgpack/msgpack";
import { unpack as decode } from 'msgpackr';
import { importTable } from '../pack/mapshaper-packed-table';
import { parsePrj, parseCrsString } from '../crs/mapshaper-projections';
import { gunzipSync, gunzipAsync, isGzipped } from '../io/mapshaper-gzip';

// Import datasets contained in a BSON blob
// Return command target as a dataset
//
export async function unpackSessionData(buf) {
  return restoreSessionData(decode(buf, {}));
}

export async function restoreSessionData(obj) {
  if (!isValidSession(obj)) {
    stop('Invalid mapshaper session data object');
  }
  var datasets = await Promise.all(obj.datasets.map(importDataset));
  return Object.assign(obj, {datasets: datasets});
}

function isValidSession(obj) {
  if (!Array.isArray(obj.datasets)) {
    return false;
  }
  return true;
}

async function importDataset(obj) {
  var arcs = null;
  if (obj.arcs) arcs = await importArcs(obj.arcs);
  return {
    info: importInfo(obj.info || {}),
    layers: (obj.layers || []).map(importLayer),
    arcs: arcs
  };
}

function bufferToDataView(buf, constructor) {
  return new constructor(BinArray.copyToArrayBuffer(buf));
  // this doesn't work: "RangeError: start offset of Float64Array should be a multiple of 8"
  // return new constructor(buf.buffer, buf.byteOffset, buf.byteLength);
}

async function importArcs(obj) {
  if (isGzipped(obj.xx)) {
    var promises = [];
    promises.push(gunzipAsync(obj.nn));
    promises.push(gunzipAsync(obj.xx));
    promises.push(gunzipAsync(obj.yy));
    if (obj.zz) {
      promises.push(gunzipAsync(obj.zz));
    }
    var data = await Promise.all(promises);
    obj.nn = data.shift();
    obj.xx = data.shift();
    obj.yy = data.shift();
    if (obj.zz) {
      obj.zz = data.shift();
    }
  }
  var nn = bufferToDataView(obj.nn, Uint32Array);
  var xx = bufferToDataView(obj.xx, Float64Array);
  var yy = bufferToDataView(obj.yy, Float64Array);
  var arcs = new ArcCollection(nn, xx, yy);
  if (obj.zz) {
    arcs.setThresholds(bufferToDataView(obj.zz, Float64Array));
    arcs.setRetainedInterval(obj.zlimit);
  }
  return arcs;
}

function importInfo(o) {
  if (o.crs_string) {
    o.crs = parseCrsString(o.crs_string);
  } else if (o.prj) {
    o.crs = parsePrj(o.prj);
  }
  return o;
}

function importLayer(lyr) {
  var data = lyr.data;
  if (data) {
    data = importTable(data);
  }
  return Object.assign(lyr, {
    data: lyr.data ? new DataTable(data) : null
  });
}