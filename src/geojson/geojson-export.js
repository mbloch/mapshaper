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
  var layerGroups, warn;

  // Apply coordinate precision, if relevant
  if (opts.precision || opts.rfc7946) {
    dataset = internal.copyDatasetForExport(dataset);
    // using 6 decimals as default RFC 7946 precision
    internal.setCoordinatePrecision(dataset, opts.precision || 0.000001);
  }

  if (opts.rfc7946) {
    warn = internal.getRFC7946Warnings(dataset);
    if (warn) message(warn);
  }

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
    var d = utils.defaults({layers: layers}, dataset);
    return {
      content: internal.exportDatasetAsGeoJSON(d, opts, 'buffer'),
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
        obj = shape ? exporter(shape, dataset.arcs, opts) : null;
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
        obj = internal.encodeString(obj, 'utf8');
        // obj = internal.stringToBuffer(obj);
        // obj = new Buffer(obj, 'utf8');
      }
    }
    memo.push(obj);
    return memo;
  }, []);
};


internal.getRFC7946Warnings = function(dataset) {
  var P = internal.getDatasetProjection(dataset);
  var str;
  if (!P || !P.is_latlong) {
    str = 'RFC 7946 warning: non-WGS84 coordinates.';
    if (P) str += ' Use "-proj wgs84" to convert.';
  }
  return str;
};

internal.getDatasetBbox = function(dataset, rfc7946) {
  var P = internal.getDatasetProjection(dataset),
      wrapped = rfc7946 && P && P.is_latlong,
      westBounds = new Bounds(),
      eastBounds = new Bounds(),
      mergedBounds, gutter, margins, bbox;

  dataset.layers.forEach(function(lyr) {
    if (internal.layerHasPaths(lyr)) {
      internal.traversePaths(lyr.shapes, null, function(o) {
        var bounds = dataset.arcs.getSimpleShapeBounds(o.arcs);
        (bounds.centerX() < 0 ? westBounds : eastBounds).mergeBounds(bounds);
      });
    } else if (internal.layerHasPoints(lyr)) {
      internal.forEachPoint(lyr.shapes, function(p) {
        (p[0] < 0 ? westBounds : eastBounds).mergePoint(p[0], p[1]);
      });
    }
  });
  mergedBounds = (new Bounds()).mergeBounds(eastBounds).mergeBounds(westBounds);
  if (mergedBounds.hasBounds()) {
    bbox = mergedBounds.toArray();
  }
  if (wrapped && eastBounds.hasBounds() && westBounds.hasBounds()) {
    gutter = eastBounds.xmin - westBounds.xmax;
    margins = 360 + westBounds.xmin - eastBounds.xmax;
    if (gutter > 0 && gutter > margins) {
      bbox[0] = eastBounds.xmin;
      bbox[2] = westBounds.xmax;
    }
  }
  return bbox || null;
};

internal.exportDatasetAsGeoJSON = function(dataset, opts, ofmt) {
  var geojson = {};
  var layers = dataset.layers;
  var useFeatures = internal.useFeatureCollection(layers, opts);
  var parts, collection, bbox, collname;

  if (useFeatures) {
    geojson.type = 'FeatureCollection';
    collname = 'features';
  } else {
    geojson.type = 'GeometryCollection';
    collname = 'geometries';
  }

  if (!opts.rfc7946) {
    // partial support for crs property (eliminated in RFC 7946)
    internal.exportCRS(dataset, geojson);
  }

  if (opts.bbox) {
    bbox = internal.getDatasetBbox(dataset, opts.rfc7946);
    if (bbox) {
      geojson.bbox = bbox;
    }
  }

  collection = layers.reduce(function(memo, lyr, i) {
    var items = internal.exportLayerAsGeoJSON(lyr, dataset, opts, useFeatures, ofmt);
    return memo.length > 0 ? memo.concat(items) : items;
  }, []);

  if (opts.geojson_type == 'Feature' && collection.length == 1) {
    return collection[0];
  } else if (ofmt) {
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

GeoJSON.exportPolygonGeom = function(ids, arcs, opts) {
  var obj = internal.exportPathData(ids, arcs, "polygon");
  if (obj.pointCount === 0) return null;
  var groups = internal.groupPolygonRings(obj.pathData, opts.invert_y);
  var reverse = opts.rfc7946 && !opts.invert_y;
  var coords = groups.map(function(paths) {
    return paths.map(function(path) {
      if (reverse) path.points.reverse();
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
  var type = opts.geojson_type || '';
  if (type == 'Feature' || type == 'FeatureCollection') {
    return true;
  } else if (type == 'GeometryCollection') {
    return false;
  } else if (type) {
    stop("Unsupported GeoJSON type:", opts.geojson_type);
  }
  // default is true iff layers contain attributes
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
