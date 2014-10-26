/* @requires mapshaper-common, mapshaper-geojson, mapshaper-topojson, mapshaper-shapefile */

// @content: ArrayBuffer or String
// @type: 'shapefile'|'json'
//
MapShaper.importFileContent = function(content, fileType, opts) {
  var dataset, fileFmt;
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
    } else if (Utils.isArray(jsonObj)) {
      dataset = {
        layers: [{
          geometry_type: null,
          data: new DataTable(jsonObj)
        }]
      };
      fileFmt = 'json';
    } else {
      stop("Unrecognized JSON format");
    }
  } else if (fileType == 'text') {
    dataset = MapShaper.importDelimitedRecords();
  } else {
    stop("Unsupported file type:", fileType);
  }
  T.stop("Import " + fileFmt);

  // topology; TODO -- consider moving this
  if ((fileFmt == 'shapefile' || fileFmt == 'geojson') && !opts.no_topology) {
    T.start();
    api.buildTopology(dataset);
    T.stop("Process topology");
  }

  if (dataset.layers.length == 1) {
    MapShaper.setLayerName(dataset.layers[0], opts.files ? opts.files[0] : "layer1");
  }
  dataset.info.input_files = opts.files;
  dataset.info.input_format = fileFmt;
  return dataset;
};


MapShaper.importJSONRecords = function(arr, opts) {
  return {
    layers: [{
      name: "",
      data: new DataTable(arr),
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
