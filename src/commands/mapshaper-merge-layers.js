/* @require mapshaper-merging, mapshaper-data-utils, mapshaper-dataset-utils */

// Merge layers, checking for incompatible geometries and data fields.
api.mergeLayers = function(layersArg, opts) {
  var layers = layersArg.filter(internal.getFeatureCount); // ignore empty layers
  var merged = {};
  opts = opts || {};
  if (!layers.length) return null;
  if (layers.length == 1) {
    message('Use the target= option to specify multiple layers for merging');
    return layers.concat();
  }
  merged.data = internal.mergeDataFromLayers(layers, opts.force);
  merged.name = internal.mergeLayerNames(layers);
  merged.geometry_type = internal.getMergedLayersGeometryType(layers);
  if (merged.geometry_type) {
    merged.shapes = internal.mergeShapesFromLayers(layers);
  }
  if (merged.shapes && merged.data && merged.shapes.length != merged.data.size()) {
    error("Mismatch between geometry and attribute data");
  }
  return [merged];
};

internal.getMergedLayersGeometryType = function(layers) {
  var geoTypes = utils.uniq(utils.pluck(layers, 'geometry_type'))
    .filter(function(type) {return !!type;}); // ignore null-type layers
  if (geoTypes.length > 1) {
    stop("Incompatible geometry types:", geoTypes.join(', '));
  }
  return geoTypes[0] || null;
};

internal.mergeShapesFromLayers = function(layers) {
  return layers.reduce(function(memo, lyr) {
    return memo.concat(lyr.shapes);
  }, []);
};

internal.mergeDataFromLayers = function(layers, force) {
  var allFields = utils.uniq(layers.reduce(function(memo, lyr) {
    return memo.concat(lyr.data ? lyr.data.getFields() : []);
  }, []));
  if (allFields.length === 0) return null; // no data in any fields
  var missingFields = internal.checkMergeLayersInconsistentFields(allFields, layers, force);
  var mergedRecords = layers.reduce(function(memo, lyr) {
    var records = lyr.data ? lyr.data.getRecords() : new DataTable(internal.getFeatureCount(lyr)).getRecords();
    return memo.concat(records);
  }, []);
  if (missingFields.length > 0) {
    internal.fixInconsistentFields(mergedRecords);
  }
  return new DataTable(mergedRecords);
};

internal.checkMergeLayersInconsistentFields = function(allFields, layers, force) {
  var msg;
  // handle fields that are missing from one or more layers
  // (warn if force-merging, else error)
  var missingFields = utils.uniq(layers.reduce(function(memo, lyr) {
    return memo.concat(utils.difference(allFields, lyr.data ? lyr.data.getFields() : []));
  }, []));
  if (missingFields.length > 0) {
    msg = '[' + missingFields.join(', ') + ']';
    msg = (missingFields.length == 1 ? 'Field ' + msg + ' is missing' : 'Fields ' + msg + ' are missing') + ' from one or more layers';
    if (force) {
      message('Warning: ' + msg);
    } else {
      stop(msg);
    }
  }
  // check for fields with incompatible data types (e.g. number, string)
  internal.checkMergeLayersFieldTypes(allFields, layers);
  return missingFields;
};

internal.checkMergeLayersFieldTypes = function(fields, layers) {
  fields.forEach(function(key) {
    var types = internal.checkFieldTypes(key, layers);
    if (types.length > 1) {
      stop("Inconsistent data types in \"" + key + "\" field:", types.join(', '));
    }
  });
};

internal.checkFieldTypes = function(key, layers) {
  // ignores empty-type fields
  return layers.reduce(function(memo, lyr) {
    var type = lyr.data ? internal.getColumnType(key, lyr.data.getRecords()) : null;
    if (type && memo.indexOf(type) == -1) {
      memo.push(type);
    }
    return memo;
  }, []);
};

internal.mergeLayerNames = function(layers) {
  return layers.reduce(function(memo, lyr) {
    if (memo === null) {
      memo = lyr.name || null;
    } else if (memo && lyr.name) {
      memo = utils.mergeNames(memo, lyr.name);
    }
    return memo;
  }, null) || '';
};
