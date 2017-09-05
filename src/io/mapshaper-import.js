/* @requires
mapshaper-common
mapshaper-geojson
mapshaper-topojson
mapshaper-shapefile
mapshaper-json-table
mapshaper-json-import
*/

// Parse content of one or more input files and return a dataset
// @obj: file data, indexed by file type
// File data objects have two properties:
//    content: Buffer, ArrayBuffer, String or Object
//    filename: String or null
//
internal.importContent = function(obj, opts) {
  var dataset, content, fileFmt, data;
  opts = opts || {};
  if (obj.json) {
    data = internal.importJSON(obj.json, opts);
    fileFmt = data.format;
    dataset = data.dataset;
  } else if (obj.text) {
    fileFmt = 'dsv';
    data = obj.text;
    dataset = internal.importDelim2(data, opts);
  } else if (obj.shp) {
    fileFmt = 'shapefile';
    data = obj.shp;
    dataset = internal.importShapefile(obj, opts);
  } else if (obj.dbf) {
    fileFmt = 'dbf';
    data = obj.dbf;
    dataset = internal.importDbf(obj, opts);
  } else if (obj.prj) {
    // added for -proj command source
    fileFmt = 'prj';
    data = obj.prj;
    dataset = {layers: [], info: {prj: data.content}};
  }

  if (!dataset) {
    stop("Missing an expected input type");
  }

  // Convert to topological format, if needed
  if (dataset.arcs && !opts.no_topology && fileFmt != 'topojson') {
    api.buildTopology(dataset);
  }

  // Use file basename for layer name, except TopoJSON, which uses object names
  if (fileFmt != 'topojson') {
    dataset.layers.forEach(function(lyr) {
      internal.setLayerName(lyr, internal.filenameToLayerName(data.filename || ''));
    });
  }

  // Add input filename and format to the dataset's 'info' object
  // (this is useful when exporting if format or name has not been specified.)
  if (data.filename) {
    dataset.info.input_files = [data.filename];
  }
  dataset.info.input_formats = [fileFmt];
  return dataset;
};

// Deprecated (included for compatibility with older tests)
internal.importFileContent = function(content, filename, opts) {
  var type = internal.guessInputType(filename, content),
      input = {};
  input[type] = {filename: filename, content: content};
  return internal.importContent(input, opts);
};


internal.importShapefile = function(obj, opts) {
  var shpSrc = obj.shp.content || obj.shp.filename, // content may be missing
      dataset = internal.importShp(shpSrc, opts),
      lyr = dataset.layers[0],
      dbf;
  if (obj.dbf) {
    dbf = internal.importDbf(obj, opts);
    utils.extend(dataset.info, dbf.info);
    lyr.data = dbf.layers[0].data;
    if (lyr.shapes && lyr.data.size() != lyr.shapes.length) {
      message("Mismatched .dbf and .shp record count -- possible data loss.");
    }
  }
  if (obj.prj) {
    dataset.info.prj = obj.prj.content;
  }
  return dataset;
};

internal.importDbf = function(input, opts) {
  var table;
  opts = utils.extend({}, opts);
  if (input.cpg && !opts.encoding) {
    opts.encoding = input.cpg.content;
  }
  table = internal.importDbfTable(input.dbf.content, opts);
  return {
    info: {},
    layers: [{data: table}]
  };
};

internal.filenameToLayerName = function(path) {
  var name = 'layer1';
  var obj = utils.parseLocalPath(path);
  if (obj.basename && obj.extension) { // exclude paths like '/dev/stdin'
    name = obj.basename;
  }
  return name;
};

// initialize layer name using filename
internal.setLayerName = function(lyr, path) {
  if (!lyr.name) {
    lyr.name = utils.getFileBase(path);
  }
};
