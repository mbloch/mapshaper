/* @requires mapshaper-common */

api.splitLayer = function(src, splitField, opts) {
  var lyr0 = opts && opts.no_replace ? MapShaper.copyLayer(src) : src,
      properties = lyr0.data ? lyr0.data.getRecords() : null,
      shapes = lyr0.shapes,
      index = {},
      splitLayers = [],
      prefix;

  if (splitField && (!properties || !lyr0.data.fieldExists(splitField))) {
    stop("[split] Missing attribute field:", splitField);
  }

  // if not splitting on a field and layer is unnamed, name split-apart layers
  // like: split-0, split-1, ...
  prefix = lyr0.name || (splitField ? '' : 'split');

  utils.repeat(MapShaper.getFeatureCount(lyr0), function(i) {
    var key = MapShaper.getSplitKey(i, splitField, properties),
        lyr;

    if (key in index === false) {
      index[key] = splitLayers.length;
      lyr = utils.defaults({
        name: MapShaper.getSplitLayerName(prefix, key),
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

MapShaper.getSplitKey = function(i, field, properties) {
  var rec = field && properties ? properties[i] : null;
  return String(rec ? rec[field] : i + 1);
};

MapShaper.getSplitLayerName = function(base, key) {
  return (base ? base + '-' : '') + key;
};
