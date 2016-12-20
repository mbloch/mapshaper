/* @require mapshaper-merging, mapshaper-data-utils */

// Merge layers; assumes that layers belong to the same dataset and have compatible
// geometries and data fields.
api.mergeLayers = function(layers) {
  var merged;
  MapShaper.checkLayersCanMerge(layers);
  layers.forEach(function(lyr) {
    if (!merged) {
      merged = lyr;
    } else {
      merged.name = utils.mergeNames(merged.name, lyr.name);
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
  return merged ? [merged] : null;
};

MapShaper.checkFieldTypes = function(key, layers) {
  // ignores empty-type fields
  return layers.reduce(function(memo, lyr) {
    var type = lyr.data ? MapShaper.getColumnType(key, lyr.data) : null;
    if (type && memo.indexOf(type) == -1) {
      memo.push(type);
    }
    return memo;
  }, []);
};

MapShaper.findMissingFields = function(layers) {
  var matrix = layers.map(function(lyr) {return lyr.data ? lyr.data.getFields() : [];});
  var allFields = matrix.reduce(function(memo, fields) {
    return utils.uniq(memo.concat(fields));
  }, []);
  return matrix.reduce(function(memo, fields) {
    var diff = utils.difference(allFields, fields);
    return utils.uniq(memo.concat(diff));
  }, []);
};

MapShaper.checkLayersCanMerge = function(layers) {
  var geoTypes = utils.uniq(utils.pluck(layers, 'geometry_type')),
      missingFields = MapShaper.findMissingFields(layers);
  if (utils.uniq(geoTypes).length > 1) {
    stop("[merge-layers] Incompatible geometry types:",
      geoTypes.map(function(type) {return type || '[none]';}).join(', '));
  }
  if (missingFields.length > 0) {
    stop("[merge-layers] Field" + utils.pluralSuffix(missingFields.length), "missing from one or more layers:",
        missingFields.join(', '));
  }
  layers[0].data.getFields().forEach(function(key) {
    var types = MapShaper.checkFieldTypes(key, layers);
    if (types.length > 1) {
      stop("[merge-layers] Inconsistent data types in \"" + key + "\" field:", types.join(', '));
    }
  });
};
