import { importDbfTable } from '../shapefile/dbf-import';
import { importShp } from '../shapefile/shp-import';
import { guessInputType } from '../io/mapshaper-file-types';
import { importDelim2 } from '../text/mapshaper-delim-import';
import { cleanPathsAfterImport } from '../paths/mapshaper-path-import';
import utils from '../utils/mapshaper-utils';
import { importJSON } from '../io/mapshaper-json-import';
import { importKML } from '../kml/kml-import';
import { buildTopology } from '../topology/mapshaper-topology';
import { message, stop, error } from '../utils/mapshaper-logging';
import { getFileBase, parseLocalPath } from '../utils/mapshaper-filename-utils';
import { importFlatgeobuf } from '../flatgeobuf/mapshaper-flatgeobuf';
import { importGeoPackage } from '../geopackage/mapshaper-geopackage-import';
import { importSVG } from '../svg/mapshaper-svg-import';

// Parse content of one or more input files and return a dataset
// @obj: file data, indexed by file type
// File data objects have two properties:
//    content: Uint8Array, Buffer, ArrayBuffer, String or Object
//    filename: String or null
//
export function importContent(obj, opts) {
  var dataset, content, dataFmt, data;
  opts = opts || {};
  if (obj.json) {
    data = importJSON(obj.json, opts);
    dataFmt = data.format;
    dataset = data.dataset;
    cleanPathsAfterImport(dataset, opts);

  } else if (obj.text) {
    dataFmt = 'dsv';
    data = obj.text;
    dataset = importDelim2(data, opts);

  } else if (obj.shp) {
    dataFmt = 'shapefile';
    data = obj.shp;
    dataset = importShapefile(obj, opts);
    cleanPathsAfterImport(dataset, opts);

  } else if (obj.dbf) {
    dataFmt = 'dbf';
    data = obj.dbf;
    dataset = importDbf(obj, opts);

  } else if (obj.prj) {
    // added for -proj command source
    dataFmt = 'prj';
    data = obj.prj;
    dataset = {layers: [], info: {wkt1: data.content}};

  } else if (obj.kml) {
    dataFmt = 'kml';
    data = obj.kml;
    dataset = importKML(data.content, opts);

  } else if (obj.svg) {
    dataFmt = 'svg';
    data = obj.svg;
    dataset = importSVG(data.content, opts);

  } else if (obj.fgb) {
    stop("FlatGeobuf import requires async import path");
  } else if (obj.gpkg) {
    stop("GeoPackage import requires async import path");
  }

  return finalizeImportedDataset(dataset, dataFmt, data, opts);
}

export async function importContentAsync(obj, opts) {
  var dataset, dataFmt, data;
  opts = opts || {};
  if (obj.fgb) {
    dataFmt = 'flatgeobuf';
    data = obj.fgb;
    dataset = await importFlatgeobuf(data.content, opts);
  } else if (obj.gpkg) {
    dataFmt = 'geopackage';
    data = obj.gpkg;
    dataset = await importGeoPackage(data.content || data.filename, opts);
  } else {
    return importContent(obj, opts);
  }
  if (Array.isArray(dataset)) {
    return dataset.map(function(ds) {
      return finalizeImportedDataset(ds, dataFmt, data, opts);
    });
  }
  return finalizeImportedDataset(dataset, dataFmt, data, opts);
}

// Deprecated (included for compatibility with older tests)
export function importFileContent(content, filename, opts) {
  var type = guessInputType(filename, content),
      input = {};
  input[type] = {filename: filename, content: content};
  return importContent(input, opts);
}


function importShapefile(obj, opts) {
  var shpSrc = obj.shp.content || obj.shp.filename, // read from a file if (binary) content is missing
      shxSrc = obj.shx ? obj.shx.content || obj.shx.filename : null,
      dataset = importShp(shpSrc, shxSrc, opts),
      lyr = dataset.layers[0],
      dbf;
  if (obj.dbf) {
    dbf = importDbf(obj, opts);
    utils.extend(dataset.info, dbf.info);
    lyr.data = dbf.layers[0].data;
    if (lyr.shapes && lyr.data.size() != lyr.shapes.length) {
      message("Mismatched .dbf and .shp record count -- possible data loss.");
    }
  }
  if (obj.prj) {
    dataset.info.wkt1 = obj.prj.content;
  }
  if (obj.cpg) {
    // TODO: consider using the input encoding as the default output encoding
    dataset.info.cpg = obj.cpg.content;
    if (typeof dataset.info.cpg != 'string') {
      error('Invalid encoding argument, expected a string');
    }
  }
  return dataset;
}

function importDbf(input, opts) {
  var table;
  opts = utils.extend({}, opts);
  if (input.cpg && !opts.encoding) {
    opts.encoding = input.cpg.content;
  }
  table = importDbfTable(input.dbf.content || input.dbf.filename, opts);
  return {
    info: {},
    layers: [{data: table}]
  };
}

function filenameToLayerName(path) {
  var name = 'layer1';
  var obj = parseLocalPath(path);
  if (obj.basename && obj.extension) { // exclude paths like '/dev/stdin'
    name = obj.basename;
  }
  return name;
}

function finalizeImportedDataset(dataset, dataFmt, data, opts) {
  if (!dataset) {
    stop("Missing an expected input type");
  }

  // Convert to topological format, if needed
  if (dataset.arcs && !opts.no_topology && dataFmt != 'topojson') {
    buildTopology(dataset);
  }

  // Use file basename for layer name, except TopoJSON, which uses object names
  if (dataFmt != 'topojson') {
    dataset.layers.forEach(function(lyr) {
      if (!lyr.name) {
        lyr.name = filenameToLayerName(data.filename || '');
      }
    });
  }

  // Add input filename and format to the dataset's 'info' object
  // (this is useful when exporting if format or name has not been specified.)
  if (data.filename) {
    dataset.info.input_files = [data.filename];
  }
  dataset.info.input_formats = [dataFmt];
  return dataset;
}
