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
  if (obj.type != "MultiPolygon") error("#exportGeoJSON() Unsupported type:", obj.type)
  var output = {
    type: "FeatureCollection"
  };
  output.features = Utils.map(obj.shapes, function(shape) {
    if (!shape || !Utils.isArray(shape)) error("[exportGeoJSON()] Missing or invalid param/s");
    return MapShaper.exportGeoJSONPolygon(shape)
  });

  T.stop("Export GeoJSON");
  return JSON.stringify(output);
};

//
MapShaper.exportGeoJSONPolygon = function(ringGroups) {
  var geom = {};
  if (ringGroups.length == 0) {
    // null shape; how to represent?
    geom.type = "Polygon";
    geom.coordinates = [];
  } else if (ringGroups.length == 1) {
    geom.type = "Polygon";
    geom.coordinates = exportCoordsForGeoJSON(ringGroups[0]);
  } else {
    geom.type = "MultiPolygon";
    geom.coordinates = Utils.map(ringGroups, exportCoordsForGeoJSON);
  }

  var feature = {
    type: "Feature",
    properties: {},
    geometry: geom
  };
  return feature;
};


function exportCoordsForGeoJSON(paths) {
  return Utils.map(paths, function(path) {
    return path.toArray();
  });
}
