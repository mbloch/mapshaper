/* @requires mapshaper-expressions */

MapShaper.evaluateLayers = function(layers, arcs, exp) {
  T.start();
  for (var i=0; i<layers.length; i++) {
    MapShaper.evaluate(layers[i], arcs, exp);
  }
  T.stop("Calculate expression");
};

MapShaper.evaluate = function(lyr, arcs, exp) {
  var shapes = lyr.shapes,
      // create new table if none exists
      dataTable = lyr.data || (lyr.data = new DataTable(shapes.length)),
      records = dataTable.getRecords(),
      compiled = MapShaper.compileFeatureExpression(exp, arcs, shapes, records);

  // call compiled expression with id of each record
  Utils.repeat(records.length, compiled);
};
