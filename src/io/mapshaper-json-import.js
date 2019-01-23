/* @requires mapshaper-common */

// Identify JSON type from the initial subset of a JSON string
internal.identifyJSONString = function(str, opts) {
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
};

internal.identifyJSONObject = function(o) {
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
};

internal.importGeoJSONFile = function(fileReader, opts) {
  var importer = new GeoJSONParser(opts);
  new GeoJSONReader(fileReader).readObjects(importer.parseObject);
  return importer.done();
};

internal.importJSONFile = function(reader, opts) {
  var str = internal.readFirstChars(reader, 1000);
  var type = internal.identifyJSONString(str, opts);
  var dataset, retn;
  if (type == 'geojson') { // consider only for larger files
    dataset = internal.importGeoJSONFile(reader, opts);
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
};

internal.importJSON = function(data, opts) {
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
      content = internal.bufferToString(utils.createBuffer(content));
    } else {
      reader = new BufferReader(content);
      content = null;
    }
  }

  if (reader) {
    data = internal.importJSONFile(reader, opts);
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
        stop("Unable to parse JSON");
      }
    }
    if (opts.json_path) {
      content = internal.selectFromObject(content, opts.json_path);
    }
    retn.format = internal.identifyJSONObject(content, opts);
    if (retn.format == 'topojson') {
      retn.dataset = internal.importTopoJSON(content, opts);
    } else if (retn.format == 'geojson') {
      retn.dataset = internal.importGeoJSON(content, opts);
    } else if (retn.format == 'json') {
      retn.dataset = internal.importJSONTable(content, opts);
    } else {
      stop("Unknown JSON format");
    }
  }

  return retn;
};

// path: path from top-level to the target object, as a list of property
//   names separated by '.'
internal.selectFromObject = function(o, path) {
  var parts = path.split('.');
  var value = o && o[parts[0]];
  if (parts > 1) {
    return internal.selectFromObject(value, parts.slice(1).join(''));
  }
  return value;
};
