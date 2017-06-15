/* @require mapshaper-merging, mapshaper-data-utils */

// Merge layers; assumes that layers belong to the same dataset and have compatible
// geometries and data fields.
api.mergeLayers = function(layers) {
  var merged;
  if (!layers.length) return null;
  internal.checkLayersCanMerge(layers);
  layers.forEach(function(lyr) {
    if (!merged) {
      merged = lyr;
    } else {
      if (merged.shapes && lyr.shapes) {
        merged.shapes = merged.shapes.concat(lyr.shapes);
      } else {
        merged.shapes = null;
      }
      if (merged.data && lyr.data) {
        merged.data = new DataTable(merged.data.getRecords().concat(lyr.data.getRecords()));
      } else {
        merged.data = null;
      }
    }
  });
  merged.name = internal.mergeLayerNames(layers);
  return [merged];
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

internal.checkFieldTypes = function(key, layers) {
  // ignores empty-type fields
  return layers.reduce(function(memo, lyr) {
    var type = lyr.data ? internal.getColumnType(key, lyr.data) : null;
    if (type && memo.indexOf(type) == -1) {
      memo.push(type);
    }
    return memo;
  }, []);
};

internal.findMissingFields = function(layers) {
  var matrix = layers.map(function(lyr) {return lyr.data ? lyr.data.getFields() : [];});
  var allFields = matrix.reduce(function(memo, fields) {
    return utils.uniq(memo.concat(fields));
  }, []);
  return matrix.reduce(function(memo, fields) {
    var diff = utils.difference(allFields, fields);
    return utils.uniq(memo.concat(diff));
  }, []);
};

internal.checkLayersCanMerge = function(layers) {
  var geoTypes = utils.uniq(utils.pluck(layers, 'geometry_type')),
      fields = layers[0].data ? layers[0].data.getFields() : [],
      missingFields = internal.findMissingFields(layers);
  if (utils.uniq(geoTypes).length > 1) {
    stop("Incompatible geometry types:",
      geoTypes.map(function(type) {return type || '[none]';}).join(', '));
  }
  if (missingFields.length > 0) {
    stop("Field" + utils.pluralSuffix(missingFields.length), "missing from one or more layers:",
        missingFields.join(', '));
  }
  fields.forEach(function(key) {
    var types = internal.checkFieldTypes(key, layers);
    if (types.length > 1) {
      stop("Inconsistent data types in \"" + key + "\" field:", types.join(', '));
    }
  });
};
