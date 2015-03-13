/* @requires mapshaper-common, mapshaper-geojson, mapshaper-topojson, mapshaper-shapefile */

// Parse content of an input file and return a dataset
// @content: Buffer, ArrayBuffer, String or Object
// @filename: path or filename (optional)
//
MapShaper.importFileContent = function(content, filename, opts) {
  var fileFmt, dataset, lyr;
  T.start();
  opts = opts || {};

  // Identify file format
  fileFmt = opts.format || null;
  if (!fileFmt && filename) {
    fileFmt = MapShaper.guessInputFileFormat(filename);
  }
  if (!fileFmt && utils.isString(content)) {
    if (MapShaper.stringIsJsonObject(content)) {
      content = JSON.parse(content);
    } else {
      // Assuming strings that aren't JSON objects are delimited text
      fileFmt = 'dsv';
    }
  }
  if (!fileFmt && utils.isObject(content)) {
    // Assuming json content... but what kind?
    if (content.type == 'Topology') {
      fileFmt = 'topojson';
    } else if (content.type) {
      fileFmt = 'geojson';
    }
  }

  // Input content to a dataset
  if (fileFmt == 'shapefile') {
    dataset = MapShaper.importShp(content, opts);
  } else if (fileFmt == 'topojson') {
    dataset = MapShaper.importTopoJSON(content, opts);
  } else if (fileFmt == 'geojson') {
    dataset = MapShaper.importGeoJSON(content, opts);
  } else if (fileFmt == 'dsv') {
    lyr = MapShaper.importDelimTable(content, opts);
    dataset = {
      layers: [{data: lyr.data}],
      info: {input_delimiter: lyr.info.delimiter} // kludge
    };
  } else if (fileFmt == 'dbf') {
    lyr = MapShaper.importDbfTable(content, opts);
    dataset = {
      layers: [{data: lyr.data}],
      info: {}
    };
  } else if (fileFmt) {
    stop("Unsupported file format:", fileFmt);
  } else {
    stop("Unable to determine format of input file" + (filename ? " [" + filename + "]" : ""));
  }
  T.stop("Import " + fileFmt);

  // Convert to topological format, if needed
  if (fileFmt != 'topojson' && !opts.no_topology) {
    T.start();
    api.buildTopology(dataset);
    T.stop("Process topology");
  }

  // Use file basename for layer name, except TopoJSON, which uses object names
  if (fileFmt != 'topojson') {
    MapShaper.setLayerName(dataset.layers[0], MapShaper.filenameToLayerName(filename || ''));
  }

  // Add info on input filename and format to the dataset -- useful when exporting
  //   if format or name has not been specified
  if (filename) {
    dataset.info.input_files = [filename];
  }
  dataset.info.input_format = fileFmt;
  return dataset;
};

MapShaper.filenameToLayerName = function(path) {
  var name = 'layer1';
  var obj = utils.parseLocalPath(path);
  if (obj.basename && obj.extension) { // exclude paths like '/dev/stdin'
    name = obj.basename;
  }
  return name;
};


MapShaper.importDataTable = function(table) {
  return {
    info: {},
    layers: [{
      name: "",
      data: table,
      geometry_type: null
    }]
  };
};

// initialize layer name using filename
MapShaper.setLayerName = function(lyr, path) {
  if (!lyr.name) {
    lyr.name = utils.getFileBase(path);
  }
};
