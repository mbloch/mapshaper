/* @requires mapshaper-common, mapshaper-path-import, mapshaper-data-table */

MapShaper.importGeoJSON = function(obj, opts) {
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
    };
  } else if (Utils.contains(supportedGeometries, obj.type)) {
    obj = {
      type: 'GeometryCollection',
      geometries: [obj]
    };
  }

  var properties = null, geometries;
  if (obj.type == 'FeatureCollection') {
    properties = [];
    geometries = obj.features.map(function(feat) {
      properties.push(feat.properties);
      return feat.geometry;
    });
  } else {
    geometries = obj.geometries;
  }

  // Count points in dataset (PathImporter needs total points to initialize buffers)
  //
  var pointCount = Utils.reduce(geometries, function(sum, geom) {
    if (geom) { // geom may be null
      var depth = GeoJSON.geometryDepths[geom.type] || 0;
      sum += GeoJSON.countNestedPoints(geom.coordinates, depth);
    }
    return sum;
  }, 0);

  // Import GeoJSON geometries
  //
  var importer = new PathImporter(pointCount, opts);
  geometries.forEach(function(geom) {
    importer.startShape();
    var f = geom && GeoJSON.pathImporters[geom.type];
    if (f) f(geom.coordinates, importer);
  });

  var importData = importer.done();
  if (properties) {
    importData.data = new DataTable(properties);
  }
  return importData;
};


var GeoJSON = MapShaper.geojson = {};

// Functions for importing geometry coordinates using a PathImporter
//
GeoJSON.pathImporters = {
  LineString: function(coords, importer) {
    importer.importPoints(coords, false);
  },
  MultiLineString: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      GeoJSON.pathImporters.LineString(coords[i], importer);
    }
  },
  Polygon: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      importer.importPoints(coords[i], i > 0);
    }
  },
  MultiPolygon: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      GeoJSON.pathImporters.Polygon(coords[i], importer);
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

MapShaper.exportGeoJSON = function(layers, arcData, opts) {
  return layers.map(function(layer) {
    return {
      content: MapShaper.exportGeoJSONString(layer, arcData, opts),
      name: layer.name
    };
  });
};

MapShaper.exportGeoJSONString = function(layerObj, arcData, opts) {
  var type = layerObj.geometry_type;
  if (type != "polygon" && type != "polyline") error("#exportGeoJSONString() Unsupported geometry type:", type);

  var geomType = type == 'polygon' ? 'MultiPolygon' : 'MultiLineString',
      properties = layerObj.data && layerObj.data.getRecords() || null,
      useFeatures = !!properties && (!opts || !opts.cut_table);

  if (useFeatures && properties.length !== layerObj.shapes.length) {
    error("#exportGeoJSON() Mismatch between number of properties and number of shapes");
  }
  var exporter = new PathExporter(arcData, type == 'polygon');
  var objects = Utils.reduce(layerObj.shapes, function(memo, shapeIds, i) {
    var shape = exporter.exportShapeForGeoJSON(shapeIds),
        obj, str;
    if (useFeatures) {
      obj = MapShaper.exportGeoJSONFeature(shape, geomType, properties[i]);
    } else {
      obj = MapShaper.exportGeoJSONGeometry(shape, geomType);
      // null geometries not allowed in GeometryCollection, filter them
      if (obj === null) return memo;
    }
    str = JSON.stringify(obj);
    return memo === "" ? str : memo + ",\n" + str;
  }, "");

  var output = {},
      bounds = exporter.getBounds();

  if (bounds.hasBounds()) {
    output.bbox = bounds.toArray();
  }

  if (useFeatures) {
    output.type = 'FeatureCollection';
    output.features = ["$"];
  } else {
    output.type = 'GeometryCollection';
    output.geometries = ["$"];
  }

  var parts = JSON.stringify(output).split('"$"');
  return parts[0] + objects + parts[1];
};

MapShaper.exportGeoJSONObject = function(layerObj, arcData, opts) {
  return JSON.parse(MapShaper.exportGeoJSONString(layerObj, arcData, opts));
};

MapShaper.exportGeoJSONGeometry = function(coords, type) {
  var geom = {};

  if (!coords || !coords.length) {
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
};

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
