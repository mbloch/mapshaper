/* @requires mapshaper-common, mapshaper-import */

MapShaper.importJSON = function(obj) {
  if (obj.type == "Topology") {
    error("TODO: TopoJSON import.")
    return MapShaper.importTopoJSON(obj);
  }
  return MapShaper.importGeoJSON(obj);
};

MapShaper.importGeoJSON = function(obj) {
  var supportedGeometries = Utils.getKeys(GeoJSON.pathImporters);
  var supportedTypes = supportedGeometries.concat(['FeatureCollection', 'GeometryCollection']);

  if (!Utils.contains(supportedTypes, obj.type)) {
    error("#importGeoJSON() Unsupported type:", obj.type);
  }

  // Convert single feature or geometry into a collection with one member
  //
  if (obj.type == 'Feature') {
    obj = {
      type: 'FeatureCollection',
      features: [obj]
    }
  } else if (Utils.contains(supportedGeometries, obj.type)) {
    obj = {
      type: 'GeometryCollection',
      geometries: [obj]
    }
  }

  var properties = null;
  if (obj.type == 'FeatureCollection') {
    // Convert FeatureCollection to GeometryCollection, extract properties
    properties = GeoJSON.convertFeatureCollection(obj);
  }

  // Count points in dataset (PathImporter needs total points to initialize buffers)
  //
  var pointCount = Utils.reduce(obj.geometries, function(geom, sum) {
    if (!geom) return 0; // null geometry
    var depth = GeoJSON.geometryDepths[geom.type] || 0;
    return sum + GeoJSON.countNestedPoints(geom.coordinates, depth);
  }, 0);

  // Import GeoJSON geometries
  //
  var importer = new PathImporter(pointCount);
  Utils.forEach(obj.geometries, function(geom) {
    importer.startShape();
    var f = geom && GeoJSON.pathImporters[geom.type];
    f && f(geom.coordinates, importer);
  });

  var data = importer.done();
  data.properties = properties;
  return data
};


var GeoJSON = MapShaper.geojson = {};

// Functions for importing geometry coordinates using a PathImporter
//
GeoJSON.pathImporters = {
  LineString: function(coords, importer) {
    importer.importPoints(coords, false, false)
  },
  MultiLineString: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      GeoJSON.pathImporters.LineString(coords[i], importer)
    }
  },
  Polygon: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      importer.importPoints(coords[i], true, i > 0);
    }
  },
  MultiPolygon: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      GeoJSON.pathImporters.Polygon(coords[i], importer)
    }
  }
};

// Nested depth of GeoJSON Points in coordinates arrays
//
GeoJSON.geometryDepths = {
  LineString: 1,
  MultiLineString: 2,
  Polygon: 2,
  MultiPolygon: 3
};

// Convert FeatureCollection to GeometryCollection, return array of properties
//
GeoJSON.convertFeatureCollection = function(obj) {
  var properties = [];
  obj.geometries = Utils.map(obj.features, function(feat) {
    properties.push(feat.properties);
    return feat.geometry;
  });
  obj.type = 'GeometryCollection';
  delete obj.features;
  return properties;
};

// Sum points in a GeoJSON coordinates array
//
GeoJSON.countNestedPoints = function(coords, depth) {
  var tally = 0;
  if (depth == 1) {
    tally = coords.length;
  } else if (depth > 1) {
    for (var i=0, n=coords.length; i<n; i++) {
      tally += GeoJSON.countNestedPoints(coords[i], depth-1);
    }
  }
  return tally;
};


MapShaper.exportGeoJSON = function(obj) {
  T.start();
  if (!obj.shapes) error("#exportGeoJSON() Missing 'shapes' param.");

  if (obj.type != "MultiPolygon" && obj.type != "MultiLineString") error("#exportGeoJSON() Unsupported type:", obj.type);

  var properties = obj.properties,
      useFeatures = !!properties;

  if (useFeatures && properties.length !== obj.shapes.length) {
    error("#exportGeoJSON() Mismatch between number of properties and number of shapes");
  }

  var objects = Utils.map(obj.shapes, function(shape, i) {
    if (!shape || !Utils.isArray(shape)) {
      error("[exportGeoJSON()] Missing or invalid param/s");
    }
    if (useFeatures) {
      return MapShaper.exportGeoJSONFeature(shape, obj.type, properties[i]);
    } else {
      return MapShaper.exportGeoJSONGeometry(shape, obj.type);
    }
  });

  var output = {};
  if (useFeatures) {
    output.type = 'FeatureCollection';
    output.features = objects;
  } else {
    output.type = 'GeometryCollection';
    output.geometries = objects;
  }

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

MapShaper.exportGeoJSONFeature = function(pathGroups, type, properties) {
  var feature = {
    type: "Feature",
    properties: properties || null,
    geometry: MapShaper.exportGeoJSONGeometry(pathGroups, type)
  };
  return feature;
};

function exportCoordsForGeoJSON(paths) {
  return Utils.map(paths, function(path) {
    return path.toArray();
  });
}
