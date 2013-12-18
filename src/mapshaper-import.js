/* @requires mapshaper-common, mapshaper-geojson, mapshaper-topojson, mapshaper-shapefile */

// @content: ArrayBuffer or String
// @type: 'shapefile'|'json'
//
MapShaper.importContent = function(content, fileType, opts) {
  var src = MapShaper.importFileContent(content, fileType, opts),
      fmt = src.info.input_format,
      imported;

  if (fmt == 'shapefile' || fmt == 'geojson') {
    imported = MapShaper.createTopology(src);
  } else if (fmt == 'topojson') {
    imported = src; // already in topological format
  }
  imported.info = {
    input_format: fmt
  };
  return imported;
};

MapShaper.importFileContent = function(content, fileType, opts) {
  var data,
      fileFmt;
  if (fileType == 'shp') {
    data = MapShaper.importShp(content, opts);
    fileFmt = 'shapefile';
  } else if (fileType == 'json') {
    var jsonObj = JSON.parse(content);
    if (jsonObj.type == 'Topology') {
      data = MapShaper.importTopoJSON(jsonObj, opts);
      fileFmt = 'topojson';
    } else {
      data = MapShaper.importGeoJSON(jsonObj, opts);
      fileFmt = 'geojson';
    }
  } else {
    error("Unsupported file type:", fileType);
  }
  data.info.input_format = fileFmt;
  return data;
};

MapShaper.createTopology = function(src) {
  var topo = MapShaper.buildTopology(src.geometry),
      shapes, lyr;
  shapes = groupPathsByShape(topo.paths, src.geometry.validPaths,
      src.info.input_shape_count);
  lyr = {
    name: '',
    geometry_type: src.info.input_geometry_type,
    shapes: shapes,
    data: src.data || null
  };

  return {
    layers: [lyr],
    arcs: topo.arcs
  };
};

// Use shapeId property of @pathData objects to group paths by shape
//
function groupPathsByShape(paths, pathData, shapeCount) {
  var shapes = new Array(shapeCount); // Array can be sparse, but should have this length
  Utils.forEach(paths, function(path, pathId) {
    var shapeId = pathData[pathId].shapeId;
    if (shapeId in shapes === false) {
      shapes[shapeId] = [path]; // first part in a new shape
    } else {
      shapes[shapeId].push(path);
    }
  });
  return shapes;
}
