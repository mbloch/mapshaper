/* @requires
mapshaper-common,
mapshaper-dataset-utils,
mapshaper-path-import,
mapshaper-path-export,
mapshaper-data-table
*/

MapShaper.importGeoJSON = function(obj, opts) {
  if (Utils.isString(obj)) {
    obj = JSON.parse(obj);
  }
  var supportedGeometries = Utils.getKeys(GeoJSON.pathImporters);

  // Convert single feature or geometry into a collection with one member
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

  if (obj.type != 'FeatureCollection' && obj.type != 'GeometryCollection') {
    error("[importGeoJSON()] Unsupported GeoJSON type:", obj.type);
  }

  var properties = null, geometries;
  if (obj.type == 'FeatureCollection') {
    properties = [];
    geometries = obj.features.map(function(feat) {
      var rec = feat.properties;
      if (opts.id_field) {
        rec[opts.id_field] = feat.id || null;
      }
      properties.push(rec);
      return feat.geometry;
    });
  } else {
    geometries = obj.geometries;
  }

  // Count points in dataset (PathImporter needs total points to initialize buffers)
  //
  var pathPoints = Utils.reduce(geometries, function(sum, geom) {
    if (geom && geom.type in GeoJSON.geometryDepths) {
      sum += GeoJSON.countNestedPoints(geom.coordinates, GeoJSON.geometryDepths[geom.type]);
    }
    return sum;
  }, 0);

  // Import GeoJSON geometries
  //
  var importer = new PathImporter(pathPoints, opts);
  geometries.forEach(function(geom) {
    importer.startShape();
    if (geom) {
      GeoJSON.importGeometry(geom.type, geom.coordinates, importer);
    }
  });

  var importData = importer.done();
  if (properties) {
    importData.layers[0].data = new DataTable(properties);
  }
  return importData;
};

var GeoJSON = MapShaper.geojson = {};

GeoJSON.translateGeoJSONType = function(type) {
  return GeoJSON.typeLookup[type] || null;
};

GeoJSON.typeLookup = {
  LineString: 'polyline',
  MultiLineString: 'polyline',
  Polygon: 'polygon',
  MultiPolygon: 'polygon',
  Point: 'point',
  MultiPoint: 'point'
};

GeoJSON.importGeometry = function(type, coords, importer) {
  if (type in GeoJSON.pathImporters) {
    GeoJSON.pathImporters[type](coords, importer);
  } else {
    verbose("TopoJSON.importGeometryCollection() Unsupported geometry type:", geom.type);
  }
};

// Functions for importing geometry coordinates using a PathImporter
//
GeoJSON.pathImporters = {
  LineString: function(coords, importer) {
    importer.importLine(coords);
  },
  MultiLineString: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      GeoJSON.pathImporters.LineString(coords[i], importer);
    }
  },
  Polygon: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      importer.importPolygon(coords[i], i > 0);
    }
  },
  MultiPolygon: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      GeoJSON.pathImporters.Polygon(coords[i], importer);
    }
  },
  Point: function(coord, importer) {
    importer.importPoints([coord]);
  },
  MultiPoint: function(coords, importer) {
    importer.importPoints(coords);
  }
};

// Nested depth of GeoJSON Points in coordinates arrays
//
GeoJSON.geometryDepths = {
  //Point: 0,
  //MultiPoint: 1,
  LineString: 1,
  MultiLineString: 2,
  Polygon: 2,
  MultiPolygon: 3
};

// Sum points in a GeoJSON coordinates array
GeoJSON.countNestedPoints = function(coords, depth) {
  var tally = 0;
  if (depth == 1) {
    tally = coords.length;
  } else if (depth > 1) {
    for (var i=0, n=coords.length; i<n; i++) {
      tally += GeoJSON.countNestedPoints(coords[i], depth-1);
    }
  } else if (depth === 0 && coords) {
    tally = 1;
  }
  return tally;
};

MapShaper.exportGeoJSON = function(dataset, opts) {
  var extension = '.' + (opts.output_extension || "json");
  return dataset.layers.map(function(lyr) {
    return {
      content: MapShaper.exportGeoJSONString(lyr, dataset.arcs, opts),
      filename: lyr.name ? lyr.name + extension : ""
    };
  });
};

MapShaper.exportGeoJSONString = function(lyr, arcs, opts) {
  opts = opts || {};
  var type = lyr.geometry_type,
      properties = lyr.data && lyr.data.getRecords() || null,
      useProperties = !!properties && !(opts.cut_table || opts.drop_table),
      useFeatures = useProperties || opts.id_field;

  if (properties && properties.length !== lyr.shapes.length) {
    error("#exportGeoJSON() Mismatch between number of properties and number of shapes");
  }

  var objects = Utils.reduce(lyr.shapes, function(memo, shape, i) {
    var obj = MapShaper.exportGeoJSONGeometry(shape, arcs, type),
        str;
    if (useFeatures) {
      obj = {
        type: "Feature",
        properties: useProperties && properties[i] || null,
        geometry: obj
      };
    } else if (obj === null) {
      return memo; // null geometries not allowed in GeometryCollection, skip them
    }
    if (properties && opts.id_field) {
      obj.id = properties[i][opts.id_field] || null;
    }
    str = JSON.stringify(obj);
    return memo === "" ? str : memo + ",\n" + str;
  }, "");

  var output = useFeatures ? {
    type: "FeatureCollection",
    features: ["$"]
  } : {
    type: "GeometryCollection",
    geometries: ["$"]
  };

  if (opts.bbox) {
    var bounds = MapShaper.getLayerBounds(lyr, arcs);
    if (bounds.hasBounds()) {
      output.bbox = bounds.toArray();
    }
  }

  var parts = JSON.stringify(output).split('"$"');
  return parts[0] + objects + parts[1];
};

MapShaper.exportGeoJSONObject = function(lyr, arcs, opts) {
  return JSON.parse(MapShaper.exportGeoJSONString(lyr, arcs, opts));
};

// export GeoJSON or TopoJSON point geometry
GeoJSON.exportPointGeom = function(points, arcs) {
  var geom = null;
  if (points.length == 1) {
    geom = {
      type: "Point",
      coordinates: points[0]
    };
  } else if (points.length > 1) {
    geom = {
      type: "MultiPoint",
      coordinates: points
    };
  }
  return geom;
};

GeoJSON.exportLineGeom = function(ids, arcs) {
  var obj = MapShaper.exportPathData(ids, arcs, "polyline");
  if (obj.pointCount === 0) return null;
  var coords = obj.pathData.map(function(path) {
    return path.points;
  });
  return coords.length == 1 ? {
    type: "LineString",
    coordinates: coords[0]
  } : {
    type: "MultiLineString",
    coordinates: coords
  };
};

GeoJSON.exportPolygonGeom = function(ids, arcs) {
  var obj = MapShaper.exportPathData(ids, arcs, "polygon");
  if (obj.pointCount === 0) return null;
  var groups = MapShaper.groupPolygonRings(obj.pathData);
  var coords = groups.map(function(paths) {
    return paths.map(function(path) {
      return path.points;
    });
  });
  return coords.length == 1 ? {
    type: "Polygon",
    coordinates: coords[0]
  } : {
    type: "MultiPolygon",
    coordinates: coords
  };
};

MapShaper.exportGeoJSONGeometry = function(shape, arcs, type) {
  return shape ? GeoJSON.exporters[type](shape, arcs) : null;
};

GeoJSON.exporters = {
  polygon: GeoJSON.exportPolygonGeom,
  polyline: GeoJSON.exportLineGeom,
  point: GeoJSON.exportPointGeom
};
