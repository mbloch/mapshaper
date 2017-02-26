/* @requires
geojson-common
mapshaper-stringify
mapshaper-path-export
mapshaper-dataset-utils
mapshaper-merge-layers
*/

MapShaper.exportGeoJSON = function(dataset, opts) {
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
    var name = MapShaper.mergeLayerNames(layers) || 'output';
    return {
      content: MapShaper.exportLayersAsGeoJSON(layers, dataset, opts, true),
      filename: name + '.' + extension
    };
  });
};

// Return an array of Features or Geometries as objects or strings
//
MapShaper.exportLayerAsGeoJSON = function(lyr, dataset, opts, asFeatures, asString) {
  var properties = MapShaper.exportProperties(lyr.data, opts),
    shapes = lyr.shapes,
    ids = MapShaper.exportIds(lyr.data, opts),
    items, stringify;

    if (asString) {
      stringify = opts.prettify ?
        MapShaper.getFormattedStringify(['bbox', 'coordinates']) :
        JSON.stringify;
    }

    if (properties && shapes && properties.length !== shapes.length) {
      error("[-o] Mismatch between number of properties and number of shapes");
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
      if (asString) {
        // stringify features as soon as they are generated, to reduce the
        // number of JS objects in memory (so larger files can be exported)
        obj = stringify(obj);
      }
      memo.push(obj);
      return memo;
    }, []);
};

// TODO: remove
MapShaper.exportGeoJSONCollection = function(lyr, dataset, opts) {
  return MapShaper.exportLayersAsGeoJSON([lyr], dataset, opts || {});
};

MapShaper.exportLayersAsGeoJSON = function(layers, dataset, opts, asString) {
  var geojson = {};
  var useFeatures = MapShaper.useFeatureCollection(layers, opts);
  var parts, collection, bounds, collname;

  if (useFeatures) {
    geojson.type = 'FeatureCollection';
    collname = 'features';
  } else {
    geojson.type = 'GeometryCollection';
    collname = 'geometries';
  }

  MapShaper.exportCRS(dataset, geojson);
  if (opts.bbox) {
    bounds = MapShaper.getDatasetBounds(dataset);
    if (bounds.hasBounds()) {
      geojson.bbox = bounds.toArray();
    }
  }

  collection = layers.reduce(function(memo, lyr, i) {
    var items = MapShaper.exportLayerAsGeoJSON(lyr, dataset, opts, useFeatures, asString);
    return memo.length > 0 ? memo.concat(items) : items;
  }, []);

  if (asString) {
    // collection is an array of individual GeoJSON Feature strings,
    // need to create complete GeoJSON output by concatenation.
    geojson[collname] = ["$"];
    parts = JSON.stringify(geojson).split('"$"');
    geojson = parts[0] + '\n' + collection.join(',\n') + '\n' + parts[1];
  } else {
    geojson[collname] = collection;
  }
  return geojson;
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
// TODO: generate crs if projection is known
// TODO: handle case of non-WGS84 geodetic coordinates
MapShaper.exportCRS = function(dataset, jsonObj) {
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

MapShaper.useFeatureCollection = function(layers, opts) {
  return utils.some(layers, function(lyr) {
    var fields = lyr.data ? lyr.data.getFields() : [];
    var haveData = MapShaper.useFeatureProperties(fields, opts);
    var haveId = !!MapShaper.getIdField(fields, opts);
    return haveData || haveId;
  });
};

MapShaper.useFeatureProperties = function(fields, opts) {
  return !(opts.drop_table || opts.cut_table || fields.length === 0 ||
      fields.length == 1 && fields[0] == GeoJSON.ID_FIELD);
};

MapShaper.exportProperties = function(table, opts) {
  var fields = table ? table.getFields() : [],
      idField = MapShaper.getIdField(fields, opts),
      properties, records;
  if (!MapShaper.useFeatureProperties(fields, opts)) {
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
MapShaper.getIdField = function(fields, opts) {
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

MapShaper.exportIds = function(table, opts) {
  var fields = table ? table.getFields() : [],
      idField = MapShaper.getIdField(fields, opts);
  if (!idField) return null;
  return table.getRecords().map(function(rec) {
    return idField in rec ? rec[idField] : null;
  });
};
