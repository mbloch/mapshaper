/* @requires mapshaper-common, mapshaper-import */

MapShaper.importJSON = function(obj) {
  if (Utils.isString(obj)) {
    obj = JSON.parse(obj);
  }
  if (obj.type == "Topology") {
    error("TODO: TopoJSON import.")
    return MapShaper.importTopoJSON(obj);
  }
  return MapShaper.importGeoJSON(obj);
};

MapShaper.importGeoJSON = function(obj) {
  if (Utils.isString(obj)) {
    obj = JSON.parse(obj);
  }
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

  var properties = null, geometries;
  if (obj.type == 'FeatureCollection') {
    properties = [];
    geometries = Utils.map(obj.features, function(feat) {
      properties.push(feat.properties);
      return feat.geometry;
    });
  } else {
    geometries = obj.geometries;
  }

  // Count points in dataset (PathImporter needs total points to initialize buffers)
  //
  var pointCount = Utils.reduce(geometries, function(geom, sum) {
    if (geom) { // geom may be null
      var depth = GeoJSON.geometryDepths[geom.type] || 0;
      sum += GeoJSON.countNestedPoints(geom.coordinates, depth);
    }
    return sum;
  }, 0);

  // Import GeoJSON geometries
  //
  var importer = new PathImporter(pointCount);
  Utils.forEach(geometries, function(geom) {
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
  var json = JSON.stringify(MapShaper.exportGeoJSONObject(obj));
  T.stop("Export GeoJSON");
  return json;
}

MapShaper.exportGeoJSONObject = function(obj) {
  if (!obj.shapes || !obj.arcs) error("#exportGeoJSON() Missing a required parameter.");
  if (obj.type != "polygon" && obj.type != "polyline") error("#exportGeoJSON() Unsupported type:", obj.type);

  var geomType = obj.type == 'polygon' ? 'MultiPolygon' : 'MultiLineString',
      properties = obj.properties,
      useFeatures = !!properties;

  if (useFeatures && properties.length !== obj.shapes.length) {
    error("#exportGeoJSON() Mismatch between number of properties and number of shapes");
  }
  var exporter = new PathExporter(obj.arcs, obj.type == 'polygon');
  var objects = Utils.map(obj.shapes, function(shapeIds, i) {
    var shape = exporter.exportShapeForGeoJSON(shapeIds);
    if (useFeatures) {
      return MapShaper.exportGeoJSONFeature(shape, geomType, properties[i]);
    } else {
      return MapShaper.exportGeoJSONGeometry(shape, geomType);
    }
  });

  var output = {};
  if (useFeatures) {
    output.type = 'FeatureCollection';
    output.features = objects;
  } else {
    output.type = 'GeometryCollection';
    // null geometries not allowed in GeometryCollection
    output.geometries = Utils.filter(objects, function(obj) {
      return obj != null;
    });
  }

  return output;
};


MapShaper.exportGeoJSONGeometry = function(coords, type) {
  var geom = {};

  if (!coords || coords.length == 0) {
    geom = null; // null geometry
  }
  else if (type == 'MultiPolygon') {
    if (coords.length == 1) {
      geom.type = "Polygon";
      geom.coordinates = coords[0];
    } else {
      geom.type = "MultiPolygon";
      geom.coordinates = coords;
    }
  }
  else if (type == 'MultiLineString') {
    if (coords.length == 1) {
      geom.type = "LineString";
      geom.coordinates = coords[0];
    } else {
      geom.type = "MultiLineString";
      geom.coordinates = coords;
    }
  }
  else {
    geom = null;
  }
  return geom;
}

MapShaper.exportGeoJSONFeature = function(coords, type, properties) {
  var feature = {
    type: "Feature",
    properties: properties || null,
    geometry: MapShaper.exportGeoJSONGeometry(coords, type)
  };
  return feature;
};

function exportCoordsForGeoJSON(paths) {
  return Utils.map(paths, function(path) {
    return path.toArray();
  });
}
