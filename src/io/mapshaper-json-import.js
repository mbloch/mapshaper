
import { GeoJSONParser, importGeoJSON } from '../geojson/geojson-import';
import { BufferReader, FileReader, readFirstChars } from '../io/mapshaper-file-reader';
import utils from '../utils/mapshaper-utils';
import { importTopoJSON } from '../topojson/topojson-import';
import { stop } from '../utils/mapshaper-logging';
import { GeoJSONReader } from '../geojson/geojson-reader';
import { bufferToString } from '../text/mapshaper-encodings';
import { importJSONTable } from '../datatable/mapshaper-json-table';

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
  } else if (utils.isArray(o) || o.json_path) {
    fmt = 'json';
  }
  return fmt;
}

export function importGeoJSONFile(fileReader, opts) {
  var importer = new GeoJSONParser(opts);
  new GeoJSONReader(fileReader).readObjects(importer.parseObject);
  return importer.done();
}

function importJSONFile(reader, opts) {
  var str = readFirstChars(reader, 1000);
  var type = identifyJSONString(str, opts);
  var dataset, retn;
  if (type == 'geojson') { // consider only for larger files
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
      reader;

  if (!content) {
    reader = new FileReader(filename);
  } else if (content instanceof ArrayBuffer) {
    // Web API imports JSON as ArrayBuffer, to support larger files
    if (content.byteLength < 1e7) {
      // content = utils.createBuffer(content).toString();
      content = bufferToString(utils.createBuffer(content));
    } else {
      reader = new BufferReader(content);
      content = null;
    }
  }

  if (reader) {
    data = importJSONFile(reader, opts);
    if (data.dataset) {
      retn.dataset = data.dataset;
      retn.format = data.format;
    } else {
      content = data.content;
    }
  }

  if (content) {
    if (utils.isString(content)) {
      try {
        content = JSON.parse(content); // ~3sec for 100MB string
      } catch(e) {
        // stop("Unable to parse JSON");
        stop('JSON parsing error --', e.message);
      }
    }
    if (opts.json_path) {
      content = selectFromObject(content, opts.json_path);
      if (Array.isArray(content) === false) {
        stop('Expected an array at JSON path:', opts.json_path);
      }
    }
    retn.format = identifyJSONObject(content, opts);
    if (retn.format == 'topojson') {
      retn.dataset = importTopoJSON(content, opts);
    } else if (retn.format == 'geojson') {
      retn.dataset = importGeoJSON(content, opts);
    } else if (retn.format == 'json') {
      retn.dataset = importJSONTable(content, opts);
    } else {
      stop("Unknown JSON format");
    }
  }

  return retn;
}

// path: path from top-level to the target object
function selectFromObject(o, path) {
  var arrayRxp = /(.*)\[([0-9]+)\]$/;
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
