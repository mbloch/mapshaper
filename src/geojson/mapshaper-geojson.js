/* @requires
mapshaper-common,
mapshaper-dataset-utils,
mapshaper-path-import,
mapshaper-path-export,
mapshaper-data-table,
mapshaper-stringify
*/

var GeoJSON = MapShaper.geojson = {};
GeoJSON.ID_FIELD = "FID"; // default field name of imported *JSON feature ids

MapShaper.importGeoJSON = function(src, opts) {
  var srcObj = utils.isString(src) ? JSON.parse(src) : src,
      supportedGeometries = Object.keys(GeoJSON.pathImporters),
      idField = opts.id_field || GeoJSON.ID_FIELD,
      properties = null,
      geometries, srcCollection, importer, dataset;

  // Convert single feature or geometry into a collection with one member
  if (srcObj.type == 'Feature') {
    srcCollection = {
      type: 'FeatureCollection',
      features: [srcObj]
    };
  } else if (utils.contains(supportedGeometries, srcObj.type)) {
    srcCollection = {
      type: 'GeometryCollection',
      geometries: [srcObj]
    };
  } else {
    srcCollection = srcObj;
  }

  if (srcCollection.type == 'FeatureCollection') {
    properties = [];
    geometries = srcCollection.features.map(function(feat) {
      var rec = feat.properties || {};
      if ('id' in feat) {
        rec[idField] = feat.id;
      }
      properties.push(rec);
      return feat.geometry;
    });
  } else if (srcCollection.type == 'GeometryCollection') {
    geometries = srcCollection.geometries;
  } else {
    stop("[i] Unsupported GeoJSON type:", srcCollection.type);
  }

  if (!geometries) {
    stop("[i] Missing geometry data");
  }

  // Import GeoJSON geometries
  importer = new PathImporter(opts);
  geometries.forEach(function(geom) {
    importer.startShape();
    if (geom) {
      GeoJSON.importGeometry(geom, importer);
    }
  });
  dataset = importer.done();

  if (properties) {
    dataset.layers[0].data = new DataTable(properties);
  }
  MapShaper.importCRS(dataset, srcObj);

  return dataset;
};

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
  var extension = "json";
  if (opts.output_file) {
    // override default output extension if output filename is given
    extension = utils.getFileExtension(opts.output_file);
  }
  return dataset.layers.map(function(lyr) {
    return {
      content: MapShaper.exportGeoJSONString(lyr, dataset, opts),
      filename: lyr.name ? lyr.name + '.' + extension : ""
    };
  });
};

// @opt value of id-field option (empty, string or array of strings)
// @fields array
MapShaper.getIdField = function(fields, opt) {
  var ids = [];
  if (utils.isString(opt)) {
    ids.push(opt);
  } else if (utils.isArray(opt)) {
    ids = opt;
  }
  ids.push(GeoJSON.ID_FIELD); // default id field
  return utils.find(ids, function(name) {
    return utils.contains(fields, name);
  });
};

MapShaper.exportProperties = function(table, opts) {
  var fields = table ? table.getFields() : [],
      idField = MapShaper.getIdField(fields, opts.id_field),
      deleteId = idField == GeoJSON.ID_FIELD, // delete default field, not user-set fields
      properties, records;
  if (opts.drop_table || opts.cut_table || fields.length === 0 || deleteId && fields.length == 1) {
    return null;
  }
  records = table.getRecords();
  if (deleteId) {
    properties = records.map(function(rec) {
      rec = utils.extend({}, rec); // copy rec;
      delete rec[idField];
      return rec;
    });
  } else {
    properties = records;
  }
  return properties;
};

MapShaper.exportIds = function(table, opts) {
  var fields = table ? table.getFields() : [],
      idField = MapShaper.getIdField(fields, opts.id_field);
  if (!idField) return null;
  return table.getRecords().map(function(rec) {
    return idField in rec ? rec[idField] : null;
  });
};

MapShaper.importCRS = function(dataset, jsonObj) {
  if ('crs' in jsonObj) {
    dataset.info.input_crs = jsonObj.crs;
  }
};

// @jsonObj is a top-level GeoJSON or TopoJSON object
MapShaper.exportCRS = function(dataset, jsonObj) {
  var info = dataset.info || {};
  if ('output_crs' in info) {
    jsonObj.crs = info.output_crs;
  } else if ('input_crs' in info) {
    jsonObj.crs = info.input_crs;
  }
};

MapShaper.exportGeoJSONString = function(lyr, dataset, opts) {
  opts = opts || {};
  var properties = MapShaper.exportProperties(lyr.data, opts),
      arcs = dataset.arcs,
      ids = MapShaper.exportIds(lyr.data, opts),
      useFeatures = !!(properties || ids),
      stringify = JSON.stringify;

  if (opts.prettify) {
    stringify = MapShaper.getFormattedStringify(['bbox', 'coordinates']);
  }
  if (properties && properties.length !== lyr.shapes.length) {
    error("[-o] Mismatch between number of properties and number of shapes");
  }

  var output = {
    type: useFeatures ? 'FeatureCollection' : 'GeometryCollection'
  };

  MapShaper.exportCRS(dataset, output);

  if (opts.bbox) {
    var bounds = MapShaper.getLayerBounds(lyr, arcs);
    if (bounds.hasBounds()) {
      output.bbox = bounds.toArray();
    }
  }

  output[useFeatures ? 'features' : 'geometries'] = ['$'];

  // serialize features one at a time to avoid allocating lots of arrays
  // TODO: consider serializing once at the end, for clarity
  var objects = lyr.shapes.reduce(function(memo, shape, i) {
    var obj = MapShaper.exportGeoJSONGeometry(shape, arcs, lyr.geometry_type),
        str;
    if (useFeatures) {
      obj = {
        type: "Feature",
        properties: properties && properties[i] || null,
        geometry: obj
      };
    } else if (obj === null) {
      return memo; // null geometries not allowed in GeometryCollection, skip them
    }
    if (ids) {
      obj.id = ids[i];
    }
    str = stringify(obj);
    return memo === "" ? str : memo + (",\n" + str);
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
