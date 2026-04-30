
import { GeoJSONParser, importGeoJSON } from '../geojson/geojson-import';
import { BufferReader, FileReader, readFirstChars } from '../io/mapshaper-file-reader';
import utils from '../utils/mapshaper-utils';
import { importTopoJSON } from '../topojson/topojson-import';
import { stop } from '../utils/mapshaper-logging';
import { parseGeoJSON } from '../geojson/json-parser';
import { bufferToString } from '../text/mapshaper-encodings';
import { importJSONTable } from '../datatable/mapshaper-json-table';
import { Buffer } from '../utils/mapshaper-node-buffer';

// Identify JSON type from the initial subset of a JSON string
export function identifyJSONString(str, opts) {
  var maxChars = 1000;
  var fmt = null;
  if (str.length > maxChars) str = str.substr(0, maxChars);
  str = str.replace(/\s/g, '');
  if (opts && opts.json_path) {
    fmt = 'json'; // TODO: make json_path compatible with other types
  } else if (/^\[[{\]]/.test(str)) {
    // empty array or array of objects
    fmt = 'json';
  } else if (/"arcs":\[|"objects":\{|"transform":\{/.test(str)) {
    fmt =  'topojson';
  } else if (/^\{"/.test(str)) {
    fmt = 'geojson';
  }
  return fmt;
}

export function identifyJSONObject(o) {
  var fmt = null;
  if (!o) {
    //
  } else if (o.type == 'Topology') {
    fmt = 'topojson';
  } else if (o.type) {
    fmt = 'geojson';
  } else if (utils.isArray(o)) {
    fmt = 'json';
  }
  return fmt;
}

export function importGeoJSONFile(fileReader, opts) {
  var importer = new GeoJSONParser(opts);
  var obj = parseGeoJSON(fileReader, importer.parseObject);
  // TODO: examine top-level objects, like crs
  return importer.done();
}

// Parse GeoJSON directly from a binary data source (supports parsing larger files
// than the maximum JS string length) or return a string with the entire
// contents of the file.
// reader: a binary file reader
//
function readJSONFile(reader, opts) {
  var str = readFirstChars(reader, 1000);
  var type = identifyJSONString(str, opts);
  var dataset, retn;
  if (opts.ndjson) {
    // NDJSON can represent either newline-delimited GeoJSON features/geometries
    // or plain JSON records. Defer type detection until after line parsing.
    retn = {
      content: reader.toString('utf8')
    };
  } else if (type == 'geojson') { // consider only for larger files
    dataset = importGeoJSONFile(reader, opts);
    retn = {
      dataset: dataset,
      format: 'geojson'
    };
  } else {
    retn = {
      // content: cli.readFile(path, 'utf8')}
      content: reader.toString('utf8')
    };
  }
  reader.close();
  return retn;
}

export function importJSON(data, opts) {
  var content = data.content,
      filename = data.filename,
      retn = {filename: filename},
      reader, fmt;

  if (!content) {
    reader = new FileReader(filename);
  } else if (content instanceof ArrayBuffer || content instanceof Buffer || content instanceof Uint8Array) {
    // Web API imports JSON as ArrayBuffer, to support larger files
    if ((content.byteLength || content.length) < 1e7) {
      // content = utils.createBuffer(content).toString();
      content = bufferToString(utils.createBuffer(content));
      // Release the caller's buffer reference now that we have a string
      // copy -- avoids holding both a ~50MB ArrayBuffer and its decoded
      // string in memory while we JSON.parse below.
      data.content = null;
    } else {
      reader = new BufferReader(content);
      content = null;
      // BufferReader keeps its own reference; release the caller's.
      data.content = null;
    }
  }

  if (reader) {
    data = readJSONFile(reader, opts);
    if (data.dataset) {
      retn.dataset = data.dataset;
      retn.format = data.format;
    } else {
      content = data.content;
    }
  }

  if (content) {
    if (opts.ndjson) {
      var nd = importNDJSON(content, opts);
      retn.dataset = nd.dataset;
      retn.format = nd.format;
      return retn;
    }
    if (utils.isString(content)) {
      try {
        content = JSON.parse(content); // ~3sec for 100MB string
      } catch(e) {
        // stop("Unable to parse JSON");
        stop('JSON parsing error:', e.message);
      }
    }
    if (opts.json_path) {
      content = selectFromObject(content, opts.json_path);
      fmt = identifyJSONObject(content, opts);
      if (!fmt) {
        stop('Unexpected object type at JSON path:', opts.json_path);
      }
    } else {
      fmt = identifyJSONObject(content, opts);
    }
    if (fmt == 'topojson') {
      retn.dataset = importTopoJSON(content, opts);
    } else if (fmt == 'geojson') {
      retn.dataset = importGeoJSON(content, getGeoJSONImportOpts(opts));
    } else if (fmt == 'json') {
      retn.dataset = importJSONTable(content, opts);
    } else {
      stop("Unknown JSON format");
    }
    retn.format = fmt;
  }

  return retn;
}

function getGeoJSONImportOpts(opts) {
  return Object.assign({}, opts, {
    warn_projected_coords: true
  });
}

function importNDJSON(content, opts) {
  var lines = utils.isString(content) ? utils.splitLines(content) : [];
  var objects = [];
  var firstGeo = null;
  for (var i = 0; i < lines.length; i++) {
    var raw = lines[i].trim();
    if (!raw) continue;
    var obj;
    try {
      obj = JSON.parse(raw);
    } catch (e) {
      stop('NDJSON parsing error on line ' + (i + 1) + ': ' + e.message);
    }
    objects.push(obj);
    if (firstGeo === null) {
      firstGeo = isGeoJSONObject(obj);
    } else if (firstGeo !== isGeoJSONObject(obj)) {
      stop('NDJSON input mixes GeoJSON and non-GeoJSON objects');
    }
  }
  if (objects.length === 0) {
    stop('NDJSON input does not contain any JSON objects');
  }
  if (!firstGeo) {
    return {dataset: importJSONTable(objects, opts), format: 'json'};
  }
  var parser = new GeoJSONParser(getGeoJSONImportOpts(opts));
  objects.forEach(function(obj) {
    if (obj && obj.type == 'FeatureCollection') {
      (obj.features || []).forEach(parser.parseObject);
    } else if (obj && obj.type == 'GeometryCollection') {
      (obj.geometries || []).forEach(parser.parseObject);
    } else {
      parser.parseObject(obj);
    }
  });
  return {dataset: parser.done(), format: 'geojson'};
}

function isGeoJSONObject(obj) {
  if (!obj || typeof obj != 'object') return false;
  var type = obj.type;
  return type == 'Feature' || type == 'FeatureCollection' ||
    type == 'GeometryCollection' || type == 'Point' || type == 'MultiPoint' ||
    type == 'LineString' || type == 'MultiLineString' ||
    type == 'Polygon' || type == 'MultiPolygon';
}

// path: path from top-level to the target object
function selectFromObject(o, path) {
  var arrayRxp = /(.*)\[([0-9]+)\]$/; // array bracket notation w/ index
  var separator = path.indexOf('/') > 0 ? '/' : '.';
  var parts = path.split(separator);
  var subpath, array, match;

  while (parts.length > 0) {
    subpath = parts.shift();
    match = arrayRxp.exec(subpath);
    if (match) {
      array = o[match[1]];
      o = array && array[+match[2]] || null;
    } else {
      o = o[subpath];
    }
    if (!o) return null;
  }
  return o;
}
