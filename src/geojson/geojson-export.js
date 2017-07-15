/* @requires
geojson-common
mapshaper-stringify
mapshaper-path-export
mapshaper-dataset-utils
mapshaper-merge-layers
*/

internal.exportGeoJSON = function(dataset, opts) {
  opts = opts || {};
  var extension = opts.extension || "json";
  var layerGroups;
  if (opts.file) {
    // Override default output extension if output filename is given
    extension = utils.getFileExtension(opts.file);
  }
  if (opts.combine_layers) {
    layerGroups = [dataset.layers];
  } else {
    layerGroups = dataset.layers.map(function(lyr) {
      return [lyr];
    });
  }
  return layerGroups.map(function(layers) {
    // Use common part of layer names if multiple layers are being merged
    var name = internal.mergeLayerNames(layers) || 'output';
    return {
      content: internal.exportLayersAsGeoJSON(layers, dataset, opts, 'buffer'),
      filename: name + '.' + extension
    };
  });
};

// Return an array of Features or Geometries as objects or strings
//
internal.exportLayerAsGeoJSON = function(lyr, dataset, opts, asFeatures, ofmt) {
  var properties = internal.exportProperties(lyr.data, opts),
      shapes = lyr.shapes,
      ids = internal.exportIds(lyr.data, opts),
      items, stringify;

  if (ofmt) {
    stringify = opts.prettify ?
      internal.getFormattedStringify(['bbox', 'coordinates']) :
      JSON.stringify;
  }

  if (properties && shapes && properties.length !== shapes.length) {
    error("Mismatch between number of properties and number of shapes");
  }

  return (shapes || properties || []).reduce(function(memo, o, i) {
    var shape = shapes ? shapes[i] : null,
        exporter = GeoJSON.exporters[lyr.geometry_type],
        obj = shape ? exporter(shape, dataset.arcs) : null;
    if (asFeatures) {
      obj = {
        type: 'Feature',
        geometry: obj,
        properties: properties ? properties[i] : null
      };
      if (ids) {
        obj.id = ids[i];
      }
    } else if (!obj) {
      return memo; // don't add null objects to GeometryCollection
    }
    if (ofmt) {
      // stringify features as soon as they are generated, to reduce the
      // number of JS objects in memory (so larger files can be exported)
      obj = stringify(obj);
      if (ofmt == 'buffer') {
        obj = new Buffer(obj, 'utf8');
      }
    }
    memo.push(obj);
    return memo;
  }, []);
};

// TODO: remove
internal.exportGeoJSONCollection = function(lyr, dataset, opts) {
  return internal.exportLayersAsGeoJSON([lyr], dataset, opts || {});
};

internal.exportLayersAsGeoJSON = function(layers, dataset, opts, ofmt) {
  var geojson = {};
  var useFeatures = internal.useFeatureCollection(layers, opts);
  var parts, collection, bounds, collname;

  if (useFeatures) {
    geojson.type = 'FeatureCollection';
    collname = 'features';
  } else {
    geojson.type = 'GeometryCollection';
    collname = 'geometries';
  }

  internal.exportCRS(dataset, geojson);
  if (opts.bbox) {
    bounds = internal.getDatasetBounds(dataset);
    if (bounds.hasBounds()) {
      geojson.bbox = bounds.toArray();
    }
  }

  collection = layers.reduce(function(memo, lyr, i) {
    var items = internal.exportLayerAsGeoJSON(lyr, dataset, opts, useFeatures, ofmt);
    return memo.length > 0 ? memo.concat(items) : items;
  }, []);

  if (ofmt) {
    return GeoJSON.formatGeoJSON(geojson, collection, collname, ofmt);
  } else {
    geojson[collname] = collection;
    return geojson;
  }
};

GeoJSON.formatGeoJSON = function(container, collection, collType, ofmt) {
  // collection is an array of individual GeoJSON Feature|geometry strings or buffers
  var head = JSON.stringify(container).replace(/\}$/, ', "' + collType + '": [\n');
  var tail = '\n]}';
  if (ofmt == 'buffer') {
    return GeoJSON.joinOutputBuffers(head, tail, collection);
  }
  return head + collection.join(',\n') + tail;
};

GeoJSON.joinOutputBuffers = function(head, tail, collection) {
  var comma = new Buffer(',\n', 'utf8');
  var parts = collection.reduce(function(memo, buf, i) {
    if (i > 0) memo.push(comma);
    memo.push(buf);
    return memo;
  }, [new Buffer(head, 'utf8')]);
  parts.push(new Buffer(tail, 'utf8'));
  return Buffer.concat(parts);
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
  var obj = internal.exportPathData(ids, arcs, "polyline");
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
  var obj = internal.exportPathData(ids, arcs, "polygon");
  if (obj.pointCount === 0) return null;
  var groups = internal.groupPolygonRings(obj.pathData);
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
// TODO: generate crs if projection is known
// TODO: handle case of non-WGS84 geodetic coordinates
internal.exportCRS = function(dataset, jsonObj) {
  var info = dataset.info || {};
  if (!info.crs && 'input_geojson_crs' in info) {
    // use input geojson crs if available and coords have not changed
    jsonObj.crs = info.input_geojson_crs;
  } else if (info.crs && !info.crs.is_latlong) {
    // Setting output crs to null if coords have been projected
    // "If the value of CRS is null, no CRS can be assumed"
    // source: http://geojson.org/geojson-spec.html#coordinate-reference-system-objects
    jsonObj.crs = null;
  } else {
    // crs property not set: assuming WGS84
  }
};

internal.useFeatureCollection = function(layers, opts) {
  return utils.some(layers, function(lyr) {
    var fields = lyr.data ? lyr.data.getFields() : [];
    var haveData = internal.useFeatureProperties(fields, opts);
    var haveId = !!internal.getIdField(fields, opts);
    return haveData || haveId;
  });
};

internal.useFeatureProperties = function(fields, opts) {
  return !(opts.drop_table || opts.cut_table || fields.length === 0 ||
      fields.length == 1 && fields[0] == GeoJSON.ID_FIELD);
};

internal.exportProperties = function(table, opts) {
  var fields = table ? table.getFields() : [],
      idField = internal.getIdField(fields, opts),
      properties, records;
  if (!internal.useFeatureProperties(fields, opts)) {
    return null;
  }
  records = table.getRecords();
  if (idField == GeoJSON.ID_FIELD) {// delete default id field, not user-set fields
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

// @opt value of id-field option (empty, string or array of strings)
// @fields array
internal.getIdField = function(fields, opts) {
  var ids = [];
  var opt = opts.id_field;
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

internal.exportIds = function(table, opts) {
  var fields = table ? table.getFields() : [],
      idField = internal.getIdField(fields, opts);
  if (!idField) return null;
  return table.getRecords().map(function(rec) {
    return idField in rec ? rec[idField] : null;
  });
};
