/* @requires mapshaper-common */


api.splitLayer = function(lyr0, arcs, splitField) {
  var dataTable = lyr0.data;
  if (splitField && (!dataTable || !dataTable.fieldExists(splitField))) stop("[split] Missing attribute field:", splitField);

  var index = {},
      properties = splitField ? dataTable.getRecords() : null,
      shapes = lyr0.shapes,
      splitLayers = [];

  shapes.forEach(function(shp, i) {
    var key = String(splitField ? properties[i][splitField] : i),
        lyr;

    if (key in index === false) {
      index[key] = splitLayers.length;
      lyr = utils.defaults({
        name: MapShaper.getSplitLayerName(lyr0.name, key),
        data: properties ? new DataTable() : null,
        shapes: []
      }, lyr0);
      splitLayers.push(lyr);
    } else {
      lyr = splitLayers[index[key]];
    }
    lyr.shapes.push(shapes[i]);
    if (properties) {
      lyr.data.getRecords().push(properties[i]);
    }
  });
  return splitLayers;
};

MapShaper.getSplitLayerName = function(base, key) {
  return (base || 'split') + '-' + (key || '');
};
