/* @requires mapshaper-common, mapshaper-geojson, mapshaper-topojson, mapshaper-shapefile */

// @content: ArrayBuffer or String
// @type: 'shapefile'|'json'
//
api.importFileContent =
MapShaper.importFileContent = function(content, fileType, opts) {
  var dataset, fileFmt;
  opts = opts || {};
  T.start();
  if (fileType == 'shp') {
    dataset = MapShaper.importShp(content, opts);
    fileFmt = 'shapefile';
  } else if (fileType == 'json') {
    var jsonObj = JSON.parse(content);
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
    MapShaper.buildTopology(dataset);
    T.stop("Process topology");
  }

  dataset.info.input_format = fileFmt;
  return dataset;
};

api.buildTopology =
MapShaper.buildTopology = function(dataset) {
  if (!dataset.arcs) return;
  var raw = dataset.arcs.getVertexData(),
      topoData = buildPathTopology(raw.xx, raw.yy, raw.nn);
  dataset.arcs = topoData.arcs;
  dataset.layers.forEach(function(lyr) {
    if (lyr.geometry_type == 'polyline' || lyr.geometry_type == 'polygon') {
      lyr.shapes = updateArcIds(lyr.shapes, topoData.paths);
    }
  });
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

function updateArcsInShape(shape, topoPaths) {
  var shape2 = [];
  Utils.forEach(shape, function(path) {
    if (path.length != 1) {
      error("[updateArcsInShape()] Expected single-part input path, found:", path);
    }
    var pathId = path[0],
        topoPath = topoPaths[pathId];

    if (!topoPath) {
      error("[updateArcsInShape()] Missing topological path for path num:", pathId);
    }
    shape2.push(topoPath);
  });
  return shape2.length > 0 ? shape2 : null;
}

// TODO: find better name, collides with utils.updateArcIds()
function updateArcIds(src, paths) {
  return src.map(function(shape) {
    return updateArcsInShape(shape, paths);
  });
}
