/* @requires mapshaper-common */

api.splitLayer = function(src, splitField, opts) {
  var lyr0 = opts && opts.no_replace ? MapShaper.copyLayer(src) : src,
      properties = lyr0.data ? lyr0.data.getRecords() : null,
      shapes = lyr0.shapes,
      index = {},
      splitLayers = [];

  if (splitField && (!properties || !lyr0.data.fieldExists(splitField))) {
    stop("[split] Missing attribute field:", splitField);
  }

  utils.repeat(MapShaper.getFeatureCount(lyr0), function(i) {
    var key = String(splitField ? properties[i][splitField] : i),
        lyr;

    if (key in index === false) {
      index[key] = splitLayers.length;
      lyr = utils.defaults({
        name: MapShaper.getSplitLayerName(lyr0.name, key),
        data: properties ? new DataTable() : null,
        shapes: shapes ? [] : null
      }, lyr0);
      splitLayers.push(lyr);
    } else {
      lyr = splitLayers[index[key]];
    }
    if (shapes) {
      lyr.shapes.push(shapes[i]);
    }
    if (properties) {
      lyr.data.getRecords().push(properties[i]);
    }
  });
  return splitLayers;
};

MapShaper.getSplitLayerName = function(base, key) {
  return (base || 'split') + '-' + (key || '');
};
