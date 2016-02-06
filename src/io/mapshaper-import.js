/* @requires
mapshaper-common
mapshaper-geojson
mapshaper-topojson
mapshaper-shapefile
mapshaper-json-table
*/

// Parse content of one or more input files and return a dataset
// @obj: file data, indexed by file type
// File data objects have two properties:
//    content: Buffer, ArrayBuffer, String or Object
//    filename: String or null
//
MapShaper.importContent = function(obj, opts) {
  var dataset, content, fileFmt, data;
  opts = opts || {};
  if (obj.json) {
    data = obj.json;
    content = data.content;
    if (utils.isString(content)) {
      content = JSON.parse(content);
    }
    if (content.type == 'Topology') {
      fileFmt = 'topojson';
      dataset = MapShaper.importTopoJSON(content, opts);
    } else if (content.type) {
      fileFmt = 'geojson';
      dataset = MapShaper.importGeoJSON(content, opts);
    } else if (utils.isArray(content)) {
      fileFmt = 'json';
      dataset = MapShaper.importJSONTable(content, opts);
    }
  } else if (obj.text) {
    fileFmt = 'dsv';
    data = obj.text;
    dataset = MapShaper.importDelim(data.content, opts);
  } else if (obj.shp) {
    fileFmt = 'shapefile';
    data = obj.shp;
    dataset = MapShaper.importShapefile(obj, opts);
  } else if (obj.dbf) {
    fileFmt = 'dbf';
    data = obj.dbf;
    dataset = MapShaper.importDbf(obj, opts);
  }

  if (!dataset) {
    stop("Missing an expected input type");
  }

  // Convert to topological format, if needed
  if (dataset.arcs && !opts.no_topology && fileFmt != 'topojson') {
    T.start();
    api.buildTopology(dataset);
    T.stop("Process topology");
  }

  // Use file basename for layer name, except TopoJSON, which uses object names
  if (fileFmt != 'topojson') {
    MapShaper.setLayerName(dataset.layers[0], MapShaper.filenameToLayerName(data.filename || ''));
  }

  // Add input filename and format to the dataset's 'info' object
  // (this is useful when exporting if format or name has not been specified.)
  if (data.filename) {
    dataset.info.input_files = [data.filename];
  }
  dataset.info.input_format = fileFmt;

  return dataset;
};

// Deprecated (included for compatibility with older tests)
MapShaper.importFileContent = function(content, filename, opts) {
  var type = MapShaper.guessInputType(filename, content),
      input = {};
  input[type] = {filename: filename, content: content};
  return MapShaper.importContent(input, opts);
};

MapShaper.importShapefile = function(obj, opts) {
  var shpSrc = obj.shp.content || obj.shp.filename, // content may be missing
      dataset = MapShaper.importShp(shpSrc, opts),
      lyr = dataset.layers[0],
      dbf;
  if (obj.dbf) {
    dbf = MapShaper.importDbf(obj, opts);
    utils.extend(dataset.info, dbf.info);
    lyr.data = dbf.layers[0].data;
    if (lyr.data.size() != lyr.shapes.length) {
      message("[shp] Mismatched .dbf and .shp record count -- possible data loss.");
    }
  }
  if (obj.prj) {
    dataset.info.input_prj = obj.prj.content;
  }
  return dataset;
};

MapShaper.importDbf = function(input, opts) {
  var table;
  opts = utils.extend({}, opts);
  if (input.cpg && !opts.encoding) {
    opts.encoding = input.cpg.content;
  }
  table = MapShaper.importDbfTable(input.dbf.content, opts);
  return {
    info: {},
    layers: [{data: table}]
  };
};

MapShaper.filenameToLayerName = function(path) {
  var name = 'layer1';
  var obj = utils.parseLocalPath(path);
  if (obj.basename && obj.extension) { // exclude paths like '/dev/stdin'
    name = obj.basename;
  }
  return name;
};

// initialize layer name using filename
MapShaper.setLayerName = function(lyr, path) {
  if (!lyr.name) {
    lyr.name = utils.getFileBase(path);
  }
};
