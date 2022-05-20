
// utility functions for layers
import { getPointBounds, forEachPoint } from '../points/mapshaper-point-utils';
import { getPathBounds, countArcsInShapes } from '../paths/mapshaper-path-utils';
import { cloneShapes, editShapes } from '../paths/mapshaper-shape-utils';
import { stop, formatStringsAsGrid } from '../utils/mapshaper-logging';
import { DataTable } from '../datatable/mapshaper-data-table';
import { getFirstNonEmptyRecord } from '../datatable/mapshaper-data-utils';
import utils from '../utils/mapshaper-utils';
import { absArcId } from '../paths/mapshaper-arc-utils';

// Insert a column of values into a (new or existing) data field
export function insertFieldValues(lyr, fieldName, values) {
  var size = getFeatureCount(lyr) || values.length,
      table = lyr.data = (lyr.data || new DataTable(size)),
      records = table.getRecords(),
      rec, val;

  for (var i=0, n=records.length; i<n; i++) {
    rec = records[i];
    val = values[i];
    if (!rec) rec = records[i] = {};
    rec[fieldName] = val === undefined ? null : val;
  }
}

export function getLayerDataTable(lyr) {
  var data = lyr.data;
  if (!data) {
    data = lyr.data = new DataTable(lyr.shapes ? lyr.shapes.length : 0);
  }
  return data;
}

export function layerHasNonNullData(lyr) {
  return lyr.data && getFirstNonEmptyRecord(lyr.data.getRecords()) ? true : false;
}

export function layerHasGeometry(lyr) {
  return layerHasPaths(lyr) || layerHasPoints(lyr);
}

export function layerHasPaths(lyr) {
  return (lyr.geometry_type == 'polygon' || lyr.geometry_type == 'polyline') &&
    layerHasNonNullShapes(lyr);
}

export function layerHasPoints(lyr) {
  return lyr.geometry_type == 'point' && layerHasNonNullShapes(lyr);
}

export function layerHasNonNullShapes(lyr) {
  return utils.some(lyr.shapes || [], function(shp) {
    return !!shp;
  });
}

export function deleteFeatureById(lyr, i) {
  if (lyr.shapes) lyr.shapes.splice(i, 1);
  if (lyr.data) lyr.data.getRecords().splice(i, 1);
}

// TODO: move elsewhere (moved here from mapshaper-point-utils to avoid circular dependency)
export function transformPointsInLayer(lyr, f) {
  if (layerHasPoints(lyr)) {
    forEachPoint(lyr.shapes, function(p) {
      var p2 = f(p[0], p[1]);
      p[0] = p2[0];
      p[1] = p2[1];
    });
  }
}

export function getFeatureCount(lyr) {
  var count = 0;
  if (lyr.data) {
    count = lyr.data.size();
  } else if (lyr.shapes) {
    count = lyr.shapes.length;
  }
  return count;
}

export function layerIsEmpty(lyr) {
  return getFeatureCount(lyr) == 0;
}

export function requireDataField(obj, field, msg) {
  var data = obj.fieldExists ? obj : obj.data; // accept layer or DataTable
  if (!field) stop('Missing a field parameter');
  if (!data || !data.fieldExists(field)) {
    stop(msg || 'Missing a field named:', field);
  }
}

export function requireDataFields(table, fields) {
  if (!fields || !fields.length) return;
  if (!table) {
    stop("Missing attribute data");
  }
  var dataFields = table.getFields(),
      missingFields = utils.difference(fields, dataFields);
  if (missingFields.length > 0) {
    stop("Table is missing one or more fields:\n",
        missingFields, "\nExisting fields:", '\n' + formatStringsAsGrid(dataFields));
  }
}

export function layerTypeMessage(lyr, defaultMsg, customMsg) {
  var msg;
  // check that custom msg is a string (could be an index if require function is called by forEach)
  if (customMsg && utils.isString(customMsg)) {
    msg = customMsg;
  } else {
    msg = defaultMsg + ', ';
    if (!lyr || !lyr.geometry_type) {
      msg += 'received a layer with no geometry';
    } else {
      msg += 'received a ' + lyr.geometry_type + ' layer';
    }
  }
  return msg;
}

export function requirePointLayer(lyr, msg) {
  if (!lyr || lyr.geometry_type !== 'point')
    stop(layerTypeMessage(lyr, "Expected a point layer", msg));
}

export function requireSinglePointLayer(lyr, msg) {
  requirePointLayer(lyr);
  if (countMultiPartFeatures(lyr) > 0) {
    stop(msg || 'This command requires single points; layer contains multi-point features.');
  }
}

export function requirePolylineLayer(lyr, msg) {
  if (!lyr || lyr.geometry_type !== 'polyline')
    stop(layerTypeMessage(lyr, "Expected a polyline layer", msg));
}

export function requirePolygonLayer(lyr, msg) {
  if (!lyr || lyr.geometry_type !== 'polygon')
    stop(layerTypeMessage(lyr, "Expected a polygon layer", msg));
}

export function requirePathLayer(lyr, msg) {
  if (!lyr || !layerHasPaths(lyr))
    stop(layerTypeMessage(lyr, "Expected a polygon or polyline layer", msg));
}

// Used by info command and gui layer menu
export function getLayerSourceFile(lyr, dataset) {
  var inputs = dataset.info && dataset.info.input_files;
  return inputs && inputs[0] || '';
}

// Divide a collection of features with mixed types into layers of a single type
// (Used for importing TopoJSON and GeoJSON features)
export function divideFeaturesByType(shapes, properties, types) {
  var typeSet = utils.uniq(types);
  var layers = typeSet.map(function(geoType) {
    var p = [],
        s = [],
        dataNulls = 0,
        rec;

    for (var i=0, n=shapes.length; i<n; i++) {
      if (types[i] != geoType) continue;
      if (geoType) s.push(shapes[i]);
      rec = properties[i];
      p.push(rec);
      if (!rec) dataNulls++;
    }
    return {
      geometry_type: geoType,
      shapes: s,
      data: dataNulls < p.length ? new DataTable(p) : null
    };
  });
  return layers;
}

// make a stub copy if the no_replace option is given, else pass thru src layer
export function getOutputLayer(src, opts) {
  return opts && opts.no_replace ? {geometry_type: src.geometry_type} : src;
}

//
export function setOutputLayerName(dest, src, defName, opts) {
  opts = opts || {};
  if (opts.name) {
    dest.name = opts.name;
  } else if (opts.no_replace) {
    dest.name = defName || undefined;
  } else {
    dest.name = src && src.name || defName || undefined;
  }
}

// Make a deep copy of a layer
export function copyLayer(lyr) {
  var copy = copyLayerShapes(lyr);
  if (copy.data) {
    copy.data = copy.data.clone();
  }
  return copy;
}

// Make a shallow copy of a path layer; replace layer.shapes with an array that is
// filtered to exclude paths containing any of the arc ids contained in arcIds.
// arcIds: an array of (non-negative) arc ids to exclude
export function filterPathLayerByArcIds(pathLyr, arcIds) {
  var index = arcIds.reduce(function(memo, id) {
    memo[id] = true;
    return memo;
  }, {});
  // deep copy shapes; this could be optimized to only copy shapes that are modified
  var shapes = cloneShapes(pathLyr.shapes);
  editShapes(shapes, onPath); // remove paths that are missing shapes
  return utils.defaults({shapes: shapes}, pathLyr);

  function onPath(path) {
    for (var i=0; i<path.length; i++) {
      if (absArcId(path[i]) in index) {
        return null;
      }
    }
    return path;
  }
}

export function copyLayerShapes(lyr) {
  var copy = utils.extend({}, lyr);
  if (lyr.shapes) {
    copy.shapes = cloneShapes(lyr.shapes);
  }
  return copy;
}

export function countMultiPartFeatures(shapes) {
  var count = 0;
  for (var i=0, n=shapes.length; i<n; i++) {
    if (shapes[i] && shapes[i].length > 1) count++;
  }
  return count;
}

// moving this here from mapshaper-path-utils to avoid circular dependency
export function getArcPresenceTest2(layers, arcs) {
  var counts = countArcsInLayers(layers, arcs);
  return function(arcId) {
    return counts[absArcId(arcId)] > 0;
  };
}

// Count arcs in a collection of layers
export function countArcsInLayers(layers, arcs) {
  var counts = new Uint32Array(arcs.size());
  layers.filter(layerHasPaths).forEach(function(lyr) {
    countArcsInShapes(lyr.shapes, counts);
  });
  return counts;
}

// Returns a Bounds object
export function getLayerBounds(lyr, arcs) {
  var bounds = null;
  if (lyr.geometry_type == 'point') {
    bounds = getPointBounds(lyr.shapes);
  } else if (lyr.geometry_type == 'polygon' || lyr.geometry_type == 'polyline') {
    bounds = getPathBounds(lyr.shapes, arcs);
  } else {
    // just return null if layer has no bounds
    // error("Layer is missing a valid geometry type");
  }
  return bounds;
}

export function isolateLayer(layer, dataset) {
  return utils.defaults({
    layers: dataset.layers.filter(function(lyr) {return lyr == layer;})
  }, dataset);
}

export function initDataTable(lyr) {
  lyr.data = new DataTable(getFeatureCount(lyr));
}
