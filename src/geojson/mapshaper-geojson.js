/* @requires
mapshaper-common,
mapshaper-dataset-utils,
mapshaper-path-import,
mapshaper-path-export,
mapshaper-data-table,
mapshaper-stringify
*/

MapShaper.importGeoJSON = function(obj, opts) {
  if (utils.isString(obj)) {
    obj = JSON.parse(obj);
  }
  var supportedGeometries = utils.getKeys(GeoJSON.pathImporters);

  // Convert single feature or geometry into a collection with one member
  if (obj.type == 'Feature') {
    obj = {
      type: 'FeatureCollection',
      features: [obj]
    };
  } else if (utils.contains(supportedGeometries, obj.type)) {
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

  // Import GeoJSON geometries
  //
  var importer = new PathImporter(opts);
  geometries.forEach(function(geom) {
    importer.startShape();
    if (geom) {
      GeoJSON.importGeometry(geom, importer);
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

GeoJSON.importGeometry = function(geom, importer) {
  var type = geom.type;
  if (type in GeoJSON.pathImporters) {
    GeoJSON.pathImporters[type](geom.coordinates, importer);
  } else if (type == 'GeometryCollection') {
    geom.geometries.forEach(function(geom) {
      GeoJSON.importGeometry(geom, importer);
    });
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

MapShaper.exportGeoJSON = function(dataset, opts) {
  var extension = '.' + (opts.output_extension || "json");
  return dataset.layers.map(function(lyr) {
    return {
      content: MapShaper.exportGeoJSONString(lyr, dataset.arcs, opts),
      filename: lyr.name ? lyr.name + extension : ""
    };
  });
};

// @opt value of id-field option (empty, string or array of strings)
// @table DataTable
MapShaper.getIdField = function(opt, table) {
  var field = null;
  if (utils.isString(opt)) {
    opt = [opt];
  }
  if (utils.isArray(opt) && table) {
    field = utils.find(opt, function(name) {
      return table.fieldExists(name);
    });
  }
  return field;
};

MapShaper.exportGeoJSONString = function(lyr, arcs, opts) {
  opts = opts || {};
  var type = lyr.geometry_type,
      properties = lyr.data && lyr.data.getRecords() || null,
      useProperties = !!properties && !(opts.cut_table || opts.drop_table),
      idField = MapShaper.getIdField(opts.id_field, lyr.data),
      useFeatures = useProperties || idField,
      stringify = JSON.stringify;

  if (opts.prettify) {
    stringify = MapShaper.getFormattedStringify(['bbox', 'coordinates']);
  }
  if (properties && properties.length !== lyr.shapes.length) {
    error("#exportGeoJSON() Mismatch between number of properties and number of shapes");
  }

  var output = {
    type: useFeatures ? 'FeatureCollection' : 'GeometryCollection'
  };

  if (opts.bbox) {
    var bounds = MapShaper.getLayerBounds(lyr, arcs);
    if (bounds.hasBounds()) {
      output.bbox = bounds.toArray();
    }
  }

  output[useFeatures ? 'features' : 'geometries'] = ['$'];

  // serialize features one at a time to avoid allocating lots of arrays
  var objects = utils.reduce(lyr.shapes, function(memo, shape, i) {
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
    if (properties && idField) {
      obj.id = properties[i][idField] || null;
    }
    str = stringify(obj);
    return memo === "" ? str : memo + ",\n" + str;
  }, "");

  return stringify(output).replace(/[\t ]*"\$"[\t ]*/, objects);
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
