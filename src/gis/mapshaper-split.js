/* @requires mapshaper-common */

MapShaper.splitLayersOnField = function(layers, arcs, field) {
  var splitLayers = [];
  Utils.forEach(layers, function(lyr) {
    splitLayers = splitLayers.concat(MapShaper.splitOnField(lyr, arcs, field));
  });
  return splitLayers;
};

MapShaper.splitOnField = function(lyr0, arcs, field) {
  var dataTable = lyr0.data;
  if (!dataTable) error("[splitOnField] Missing a data table");
  if (!dataTable.fieldExists(field)) error("[splitOnField] Missing field:", field);

  var index = {},
      properties = dataTable.getRecords(),
      shapes = lyr0.shapes,
      splitLayers = [];

  Utils.forEach(shapes, function(shp, i) {
    var rec = properties[i],
        key = String(rec[field]), // convert numbers to strings (for layer naming)
        lyr, idx;

    if (key in index === false) {
      idx = splitLayers.length;
      index[key] = idx;
      splitLayers.push({
        name: key || Utils.getUniqueName("layer"),
        properties: [],
        shapes: []
      });
    } else {
      idx = index[key];
    }

    lyr = splitLayers[idx];
    lyr.shapes.push(shapes[i]);
    lyr.properties.push(properties[i]);
  });

  return Utils.map(splitLayers, function(obj) {
    return Opts.copyNewParams({
      name: obj.name,
      shapes: obj.shapes,
      data: new DataTable(obj.properties)
    }, lyr0);
  });
};
