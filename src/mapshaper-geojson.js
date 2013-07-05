/* @requires mapshaper-common */

MapShaper.importJSON = function(obj) {
  if (obj.type == "Topology") {
    error("TODO: TopoJSON import.")
    return MapShaper.importTopoJSON(obj);
  }
  return MapShaper.importGeoJSON(obj);
};

MapShaper.importGeoJSON = function(obj) {
  error("TODO: implement GeoJSON importing.")
};

MapShaper.exportGeoJSON = function(obj) {
  T.start();
  if (!obj.shapes) error("#exportGeoJSON() Missing 'shapes' param.");
  if (obj.type != "MultiPolygon" && obj.type != "MultiLineString") error("#exportGeoJSON() Unsupported type:", obj.type)
  var output = {
    type: "FeatureCollection"
  };
  output.features = Utils.map(obj.shapes, function(shape) {
    if (!shape || !Utils.isArray(shape)) error("[exportGeoJSON()] Missing or invalid param/s");
    return MapShaper.exportGeoJSONFeature(shape, obj.type);
  });

  T.stop("Export GeoJSON");
  return JSON.stringify(output);
};

MapShaper.exportGeoJSONGeometry = function(paths, type) {
  var geom = {};

  if (paths.length == 0) {
    geom = null; // null geometry
  }
  else if (type == 'MultiPolygon') {
    if (paths.length == 1) {
      geom.type = "Polygon";
      geom.coordinates = exportCoordsForGeoJSON(paths[0]);
    } else {
      geom.type = "MultiPolygon";
      geom.coordinates = Utils.map(paths, exportCoordsForGeoJSON);
    }
  }
  else if (type == 'MultiLineString') {
    if (paths.length == 1) {
      geom.type = "LineString";
      geom.coordinates = paths[0].toArray();
    } else {
      geom.type = "MultiLineString";
      geom.coordinates = exportCoordsForGeoJSON(paths);
    }
  }
  else {
    geom = null;
  }
  return geom;
}


//
//
MapShaper.exportGeoJSONFeature = function(pathGroups, type) {
  var feature = {
    type: "Feature",
    properties: {},
    geometry: MapShaper.exportGeoJSONGeometry(pathGroups, type)
  };
  return feature;
};

function exportCoordsForGeoJSON(paths) {
  return Utils.map(paths, function(path) {
    return path.toArray();
  });
}
