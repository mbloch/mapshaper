import { traversePaths } from '../paths/mapshaper-path-utils';
import { groupPolygonRings } from '../polygons/mapshaper-ring-nesting';
import { exportPathData } from '../paths/mapshaper-path-export';
import { forEachPoint } from '../points/mapshaper-point-utils';
import { layerHasPoints, layerHasPaths } from '../dataset/mapshaper-layer-utils';
import { isLatLngCRS, getDatasetCRS } from '../crs/mapshaper-projections';
import { getFormattedStringify, stringifyAsNDJSON } from '../geojson/mapshaper-stringify';
import { mergeLayerNames } from '../commands/mapshaper-merge-layers';
import { setCoordinatePrecision } from '../geom/mapshaper-rounding';
import { copyDatasetForExport } from '../dataset/mapshaper-dataset-utils';
import { encodeString } from '../text/mapshaper-encodings';
import GeoJSON from '../geojson/geojson-common';
import { message, error, stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { Bounds } from '../geom/mapshaper-bounds';
import { Buffer } from '../utils/mapshaper-node-buffer';
import { getFileExtension } from '../utils/mapshaper-filename-utils';
export default GeoJSON;

export function exportGeoJSON(dataset, opts) {
  opts = utils.extend({}, opts);
  opts.rfc7946 = !opts.gj2008; // use RFC 7946 as the default
  var extension = opts.extension || "json";
  var layerGroups, warn;

  // Apply coordinate precision
  if (opts.precision) {
    dataset = copyDatasetForExport(dataset);
    setCoordinatePrecision(dataset, opts.precision || 0.000001);
  }

  if (opts.rfc7946) {
    warn = getRFC7946Warnings(dataset);
    if (warn) message(warn);
  }

  if (opts.file) {
    // Override default output extension if output filename is given
    extension = getFileExtension(opts.file);
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
    var name = mergeLayerNames(layers) || 'output';
    var d = utils.defaults({layers: layers}, dataset);
    return {
      content: exportDatasetAsGeoJSON(d, opts, 'buffer'),
      filename: name + '.' + extension
    };
  });
}

// Return an array of Features or Geometries as objects or strings
//
export function exportLayerAsGeoJSON(lyr, dataset, opts, asFeatures, ofmt) {
  var properties = exportProperties(lyr.data, opts),
      shapes = lyr.shapes,
      ids = exportIds(lyr.data, opts),
      items, stringify;

  if (opts.ndjson) {
    stringify = stringifyAsNDJSON;
  } else if (opts.prettify) {
    stringify = getFormattedStringify(['bbox', 'coordinates']);
  } else {
    stringify = JSON.stringify;
  }

  if (properties && shapes && properties.length !== shapes.length) {
    error("Mismatch between number of properties and number of shapes");
  }

  return (shapes || properties || []).reduce(function(memo, o, i) {
    var shape = shapes ? shapes[i] : null,
        exporter = GeoJSON.exporters[lyr.geometry_type],
        geom = shape ? exporter(shape, dataset.arcs, opts) : null,
        obj = null;

    if (asFeatures) {
      obj = composeFeature(geom, properties ? properties[i] : null, opts);
      if (ids) {
        obj.id = ids[i];
      }
    } else if (!geom) {
      return memo; // don't add null objects to GeometryCollection
    } else {
      obj = geom;
    }
    if (ofmt) {
      // stringify features as soon as they are generated, to reduce the
      // number of JS objects in memory (so larger files can be exported)
      obj = stringify(obj);
      if (ofmt == 'buffer') {
        obj = encodeString(obj, 'utf8');
        // obj = stringToBuffer(obj);
        // obj = new Buffer(obj, 'utf8');
      }
    }
    memo.push(obj);
    return memo;
  }, []);
}

function composeFeature(geom, properties, opts) {
  var feat = GeoJSON.toFeature(geom, properties);
  if (Array.isArray(opts.hoist) && properties) {
    // don't modify properties of source feature
    feat.properties = Object.assign({}, properties);
    opts.hoist.forEach(field => {
      if (properties.hasOwnProperty(field)) {
        feat[field] = properties[field];
        delete feat.properties[field];
      }
    });
  }
  return feat;
}

export function getRFC7946Warnings(dataset) {
  var P = getDatasetCRS(dataset);
  var str;
  if (!P || !isLatLngCRS(P)) {
    str = 'RFC 7946 warning: non-WGS84 GeoJSON output.';
    if (P) str += ' Tip: use "-proj wgs84" to convert.';
  }
  return str;
}

export function getDatasetBbox(dataset, rfc7946) {
  var P = getDatasetCRS(dataset),
      wrapped = rfc7946 && P && isLatLngCRS(P),
      westBounds = new Bounds(),
      eastBounds = new Bounds(),
      mergedBounds, gutter, margins, bbox;

  dataset.layers.forEach(function(lyr) {
    if (layerHasPaths(lyr)) {
      traversePaths(lyr.shapes, null, function(o) {
        var bounds = dataset.arcs.getSimpleShapeBounds(o.arcs);
        (bounds.centerX() < 0 ? westBounds : eastBounds).mergeBounds(bounds);
      });
    } else if (layerHasPoints(lyr)) {
      forEachPoint(lyr.shapes, function(p) {
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
}

export function exportDatasetAsGeoJSON(dataset, opts, ofmt) {
  var geojson = {};
  var layers = dataset.layers;
  var useFeatures = useFeatureCollection(layers, opts);
  var collection, bbox;

  if (useFeatures) {
    geojson.type = 'FeatureCollection';
  } else {
    geojson.type = 'GeometryCollection';
  }

  if (opts.gj2008) {
    preserveOriginalCRS(dataset, geojson);
  }

  if (opts.bbox) {
    bbox = getDatasetBbox(dataset, opts.rfc7946);
    if (bbox) {
      geojson.bbox = bbox;
    }
  }

  collection = layers.reduce(function(memo, lyr, i) {
    var items = exportLayerAsGeoJSON(lyr, dataset, opts, useFeatures, ofmt);
    return memo.length > 0 ? memo.concat(items) : items;
  }, []);

  if (opts.geojson_type == 'Feature' && collection.length == 1) {
    return collection[0];
  } else if (opts.ndjson) {
    return GeoJSON.formatCollectionAsNDJSON(collection);
  } else if (ofmt) {
    return GeoJSON.formatCollection(geojson, collection);
  } else {
    geojson[collectionName(geojson.type)] = collection;
    return geojson;
  }
}

function collectionName(type) {
  if (type == 'FeatureCollection') return 'features';
  if (type == 'GeometryCollection') return 'geometries';
  error('Invalid collection type:', type);
}

// collection: an array of Buffers, one per feature
GeoJSON.formatCollectionAsNDJSON = function(collection) {
  var delim = utils.createBuffer('\n', 'utf8');
  var parts = collection.reduce(function(memo, buf, i) {
    if (i > 0) memo.push(delim);
    memo.push(buf);
    return memo;
  }, []);
  return Buffer.concat(parts);
};

// collection: an array of individual GeoJSON Features or geometries as strings or buffers
GeoJSON.formatCollection = function(container, collection) {
  var head = JSON.stringify(container).replace(/\}$/, ', "' + collectionName(container.type) + '": [\n');
  var tail = '\n]}';
  if (utils.isString(collection[0])) {
    return head + collection.join(',\n') + tail;
  }
  // assume buffers
  return GeoJSON.joinOutputBuffers(head, tail, collection);
};

GeoJSON.joinOutputBuffers = function(head, tail, collection) {
  var comma = utils.createBuffer(',\n', 'utf8');
  var parts = collection.reduce(function(memo, buf, i) {
    if (i > 0) memo.push(comma);
    memo.push(buf);
    return memo;
  }, [utils.createBuffer(head, 'utf8')]);
  parts.push(utils.createBuffer(tail, 'utf8'));
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
  var obj = exportPathData(ids, arcs, "polyline");
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
  var obj = exportPathData(ids, arcs, "polygon");
  if (obj.pointCount === 0) return null;
  var groups = groupPolygonRings(obj.pathData, arcs, opts.invert_y);
  // invert_y is used internally for SVG generation
  // mapshaper's internal winding order is the opposite of RFC 7946
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

// To preserve some backwards compatibility with old-style GeoJSON files,
// pass through any original CRS object if the crs has not been set by mapshaper
// jsonObj: a top-level GeoJSON or TopoJSON object
//
export function preserveOriginalCRS(dataset, jsonObj) {
  var info = dataset.info || {};
  if (!info.crs && 'input_geojson_crs' in info) {
    // use input geojson crs if available and coords have not changed
    jsonObj.crs = info.input_geojson_crs;

  }

  // Removing the following (seems ineffectual at best)
  // else if (info.crs && !isLatLngCRS(info.crs)) {
  //   // Setting output crs to null if coords have been projected
  //   // "If the value of CRS is null, no CRS can be assumed"
  //   // source: http://geojson.org/geojson-spec.html#coordinate-reference-system-objects
  //   jsonObj.crs = null;
  // }
}

export function useFeatureCollection(layers, opts) {
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
    var haveData = useFeatureProperties(fields, opts);
    var haveId = !!getIdField(fields, opts);
    return haveData || haveId;
  });
}

function useFeatureProperties(fields, opts) {
  return !(opts.drop_table || opts.cut_table || fields.length === 0 ||
      fields.length == 1 && fields[0] == GeoJSON.ID_FIELD);
}

export function exportProperties(table, opts) {
  var fields = table ? table.getFields() : [],
      idField = getIdField(fields, opts),
      properties, records;
  if (!useFeatureProperties(fields, opts)) {
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
}

// @opt value of id-field option (empty, string or array of strings)
// @fields array
export function getIdField(fields, opts) {
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
}

export function exportIds(table, opts) {
  var fields = table ? table.getFields() : [],
      idField = getIdField(fields, opts);
  if (!idField) return null;
  return table.getRecords().map(function(rec) {
    return idField in rec ? rec[idField] : null;
  });
}
