/* @requires mapshaper-common, mapshaper-geojson, mapshaper-topojson, mapshaper-shapefile */

// Parse content of an input file and return a dataset
// @content: ArrayBuffer or String
// @name: path or filename
//
MapShaper.importFileContent = function(content, name, opts) {
  var fileType = MapShaper.guessFileType(name),
      dataset, lyr, fileFmt;
  opts = opts || {};
  T.start();
  if (fileType == 'shp') {
    dataset = MapShaper.importShp(content, opts);
    fileFmt = 'shapefile';
  } else if (fileType == 'json') {
    var jsonObj = utils.isString(content) ? JSON.parse(content) : content;
    if (jsonObj.type == 'Topology') {
      dataset = MapShaper.importTopoJSON(jsonObj, opts);
      fileFmt = 'topojson';
    } else if ('type' in jsonObj) {
      dataset = MapShaper.importGeoJSON(jsonObj, opts);
      fileFmt = 'geojson';

    } else {
      stop("Unrecognized JSON format");
    }
  } else if (fileType == 'txt') {
    // Assuming text files are in delimited format
    lyr = MapShaper.importDelimTable(content, opts);
    fileFmt = 'dsv';
    dataset = {
      layers: [{data: lyr.data}],
      info: {input_delimiter: lyr.info.delimiter} // kludge
    };

  } else if (fileType == 'dbf') {
    lyr = MapShaper.importDbfTable(content, opts);
    fileFmt = 'dbf';
    dataset = {
      layers: [{data: lyr.data}],
      info: {}
    };
  } else {
    stop("Unsupported file type:", fileType);
  }
  T.stop("Import " + fileFmt);

  if ((fileFmt == 'shapefile' || fileFmt == 'geojson') && !opts.no_topology) {
    T.start();
    api.buildTopology(dataset);
    T.stop("Process topology");
  }

  if (fileFmt != 'topojson') {
    MapShaper.setLayerName(dataset.layers[0], MapShaper.filenameToLayerName(name));
  }
  dataset.info.input_format = fileFmt;
  dataset.info.input_files = [name];
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
