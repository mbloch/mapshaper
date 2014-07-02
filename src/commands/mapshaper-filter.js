/* @requires mapshaper-expressions */

api.filterFeatures = function(lyr, arcs, exp) {
  var records = lyr.data ? lyr.data.getRecords() : null,
      compiled = MapShaper.compileFeatureExpression(exp, lyr, arcs);

  var selectedShapes = [],
      selectedRecords = [];

  Utils.forEach(lyr.shapes, function(shp, shapeId) {
    var rec = records ? records[shapeId] : null,
        result = compiled(shapeId);

    if (!Utils.isBoolean(result)) {
      stop("[filter] Expressions must return true or false");
    }
    if (result) {
      selectedShapes.push(shp);
      if (records) selectedRecords.push(rec);
    }
  });

  lyr.shapes = selectedShapes;
  if (records) {
    lyr.data = new DataTable(selectedRecords);
  }
};

MapShaper.filterDataTable = function(data, exp) {
  var compiled = MapShaper.compileFeatureExpression(exp, {data: data}, null),
      filtered = Utils.filter(data.getRecords(), function(rec, i) {
        return compiled(i);
      });
  return new DataTable(filtered);
};
