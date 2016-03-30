/* @requires
geojson-common
mapshaper-stringify
mapshaper-path-export
mapshaper-dataset-utils
*/

MapShaper.exportGeoJSON = function(dataset, opts) {
  var extension = "json";
  if (opts.output_file) {
    // override default output extension if output filename is given
    extension = utils.getFileExtension(opts.output_file);
  }
  return dataset.layers.map(function(lyr) {
    return {
      content: MapShaper.exportLayerAsGeoJSON(lyr, dataset, opts),
      filename: lyr.name ? lyr.name + '.' + extension : ""
    };
  });
};

MapShaper.exportGeoJSONCollection = function(lyr, dataset, opts) {
  opts = opts || {};
  var properties = MapShaper.exportProperties(lyr.data, opts),
      shapes = lyr.shapes,
      ids = MapShaper.exportIds(lyr.data, opts),
      useFeatures = !!(properties || ids),
      geojson, geometries, bounds;

  if (properties && shapes && properties.length !== shapes.length) {
    error("[-o] Mismatch between number of properties and number of shapes");
  }

  geometries = (shapes || properties || []).map(function(o, i) {
    var shape = shapes ? shapes[i] : null,
        type = lyr.geometry_type;
    return shape ? GeoJSON.exporters[type](shape, dataset.arcs) : null;
  });

  if (useFeatures) {
    geojson = {
      type: 'FeatureCollection'
    };
    geojson.features = geometries.map(function(geom, i) {
      var feat = {
        type: 'Feature',
        geometry: geom,
        properties: properties ? properties[i] : null
      };
      if (ids) {
        feat.id = ids[i];
      }
      return feat;
    });
  } else {
    // null geometries not allowed in GeometryCollection, skip them
    geojson = {
      type: 'GeometryCollection',
      geometries: geometries.filter(function(geom) {return !!geom;})
    };
  }

  MapShaper.exportCRS(dataset, geojson);
  if (opts.bbox) {
    bounds = MapShaper.getLayerBounds(lyr, dataset.arcs);
    if (bounds.hasBounds()) {
      geojson.bbox = bounds.toArray();
    }
  }
  return geojson;
};

MapShaper.exportLayerAsGeoJSON = function(lyr, dataset, opts) {
  var stringify = opts && opts.prettify ?
    MapShaper.getFormattedStringify(['bbox', 'coordinates']) : JSON.stringify;
  return stringify(MapShaper.exportGeoJSONCollection(lyr, dataset, opts));
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

GeoJSON.exporters = {
  polygon: GeoJSON.exportPolygonGeom,
  polyline: GeoJSON.exportLineGeom,
  point: GeoJSON.exportPointGeom
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
