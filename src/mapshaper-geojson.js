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
  if (!obj.shapes || !obj.arcs) error("Missing 'shapes' and/or 'arcs' properties.");

  var features = Utils.map(obj.shapes, function(topoShape) {
    if (!topoShape || !Utils.isArray(topoShape)) error("[exportGeoJSON()] Missing or invalid param/s");
    var data = MapShaper.convertTopoShape(topoShape, obj.arcs);
    return MapShaper.getGeoJSONPolygonFeature(data.parts);
  });

  var root = {
    type: "FeatureCollection",
    features: features
  };

  T.stop("Export GeoJSON");
  return JSON.stringify(root);
};

// TODO: Implement the GeoJSON spec for holes.
//
MapShaper.getGeoJSONPolygonFeature = function(ringsIn) {
  var rings = Utils.map(ringsIn, MapShaper.transposeXYCoords),
      ringCount = rings.length,
      geom = {};
  if (ringCount == 0) {
    // null shape; how to represent?
    geom.type = "Polygon";
    geom.coordinates = [[]];
  } else if (ringCount == 1) {
    geom.type = "Polygon";
    geom.coordinates = rings;
  } else {
    geom.type = "MultiPolygon";
    geom.coordinates = Utils.map(rings, function(ring) {return [ring]});
  }

  var feature = {
    type: "Feature",
    properties: {},
    geometry: geom
  };

  return feature;
};

