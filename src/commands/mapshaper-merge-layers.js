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

MapShaper.checkFieldType = function(key, layers) {
  // accepts empty + non-empty field types
  return layers.reduce(function(memo, lyr) {
    var type = lyr.data ? MapShaper.getColumnType(key, lyr.data) : null;
    if (!memo) {
      memo = type;
    } else if (type && type != memo) {
      memo = 'mixed';
    }
    return memo;
  }, null);
};

MapShaper.checkLayersCanMerge = function(layers) {
  var geoTypes = utils.uniq(utils.pluck(layers, 'geometry_type')),
      dataKeys = utils.uniq(layers.map(getDataKey)),
      fields = dataKeys[0] ? layers[0].data.getFields() : [];
  if (utils.uniq(geoTypes).length > 1) {
    stop("[merge-layers] Incompatible geometry types");
  }
  if (utils.uniq(dataKeys).length > 1) {
    stop("[merge-layers] Incompatible fields");
  }
  fields.forEach(function(key) {
    var type = MapShaper.checkFieldType(key, layers);
    if (type == 'mixed') {
      stop("[merge-layers] Inconsistent data types in field:", key);
    }
  });

  function getDataKey(lyr) {
    return lyr.data ? lyr.data.getFields().sort().join(',') : '';
  }
};
