/* @requires mapshaper-common */

// Identify JSON type from the initial subset of a JSON string
internal.identifyJSONString = function(str) {
  var maxChars = 1000;
  var fmt = null;
  if (str.length > maxChars) str = str.substr(0, maxChars);
  str = str.replace(/\s/g, '');
  if (/^\[[{\]]/.test(str)) {
    // empty array of array of objects
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
  if (o.type == 'Topology') {
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

internal.importJSONFile = function(path, opts) {
  var reader = new FileReader(path);
  var str = reader.readSync(0, Math.min(1000, reader.size())).toString('utf8');
  var type = internal.identifyJSONString(str);
  var dataset, retn;
  if (type == 'geojson') { // consider only for larger files
    dataset = internal.importGeoJSONFile(reader, opts);
    reader.close();
    return {
      dataset: dataset,
      format: 'geojson'
    };
  } else {
    reader.close();
    return {content: cli.readFile(path, 'utf8')};
  }
};

internal.importJSON = function(data, opts) {
  var content = data.content,
      filename = data.filename,
      retn = {filename: filename};

  if (!content) {
    data = internal.importJSONFile(filename, opts);
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
    retn.format = internal.identifyJSONObject(content);
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