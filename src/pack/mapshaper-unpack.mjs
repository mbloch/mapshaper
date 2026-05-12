import { ArcCollection } from '../paths/mapshaper-arcs';
import { DataTable } from '../datatable/mapshaper-data-table';
import { stop, warn } from '../utils/mapshaper-logging';
import { BinArray } from '../utils/mapshaper-binarray';
// import { decode } from "@msgpack/msgpack";
import { unpack as decode } from 'msgpackr';
import { importTable } from '../pack/mapshaper-packed-table';
import { parsePrj, parseCrsString, initProjLibrary } from '../crs/mapshaper-projections';
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
  datasets = datasets.filter(Boolean); // skip corrupted datasets
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
  var layers = (obj.layers || []).map(importLayer);
  try {
    if (obj.arcs) {
      arcs = await importArcs(obj.arcs);
    }
  } catch(e) {
    warn(`Some coordinates are corrupted, skipping ${layers.length == 1 ? 'a layer' : layers.length + ' layers'}.`);
    return null;
  }

  return {
    info: await importInfo(obj.info || {}),
    layers: layers,
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

async function importInfo(o) {
  if (o.crs_string) {
    // load external files (e.g. epsg definitions) if needed in GUI
    await initProjLibrary({crs: o.crs_string});
    o.crs = parseCrsString(o.crs_string);
  } else if (o.wkt1) {
    // Shapefile-sourced snapshots typically carry wkt1 but no crs_string;
    // reconstitute the proj object from it so direct readers of info.crs work.
    o.crs = parsePrj(o.wkt1);
  } else if (o.prj) {
    // legacy field name; older snapshots may have stored the .prj content here
    o.crs = parsePrj(o.prj);
  }
  return o;
}

function importLayer(lyr) {
  var data = lyr.data;
  if (data) {
    data = importTable(data);
  }
  if (lyr.raster) {
    lyr.raster = importRasterData(lyr.raster);
  }
  return Object.assign(lyr, {
    data: lyr.data ? new DataTable(data) : null
  });
}

function importRasterData(raster) {
  var copy = Object.assign({}, raster);
  if (raster.grid) {
    copy.grid = Object.assign({}, raster.grid);
    if (raster.grid.samples) {
      copy.grid.samples = restoreRasterSamples(raster.grid.samples, raster.grid.pixelType);
    }
  }
  if (raster.view) {
    copy.view = Object.assign({}, raster.view);
    if (raster.view.preview) {
      copy.view.preview = Object.assign({}, raster.view.preview);
      if (raster.view.preview.pixels) {
        copy.view.preview.pixels = new Uint8ClampedArray(BinArray.copyToArrayBuffer(raster.view.preview.pixels));
      }
    }
  }
  if (raster.preview) {
    copy.preview = Object.assign({}, raster.preview);
    if (raster.preview.pixels) {
      copy.preview.pixels = new Uint8ClampedArray(BinArray.copyToArrayBuffer(raster.preview.pixels));
    }
  }
  if (raster.pixels) {
    copy.pixels = new Uint8ClampedArray(BinArray.copyToArrayBuffer(raster.pixels));
  }
  return copy;
}

function restoreRasterSamples(buf, pixelType) {
  var arrbuf = BinArray.copyToArrayBuffer(buf);
  var Ctor = getRasterSampleArrayConstructor(pixelType);
  return new Ctor(arrbuf);
}

function getRasterSampleArrayConstructor(pixelType) {
  switch (pixelType) {
    case 'uint8': return Uint8Array;
    case 'int8': return Int8Array;
    case 'uint16': return Uint16Array;
    case 'int16': return Int16Array;
    case 'uint32': return Uint32Array;
    case 'int32': return Int32Array;
    case 'float32': return Float32Array;
    case 'float64': return Float64Array;
  }
  return Uint8Array;
}