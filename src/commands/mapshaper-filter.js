/* @requires mapshaper-expressions */

api.filterFeatures = function(lyr, arcs, exp) {
  MapShaper.select(lyr, arcs, exp, true);
};

MapShaper.select = function(lyr, arcs, exp, discard) {
  var records = lyr.data ? lyr.data.getRecords() : null,
      shapes = lyr.shapes,
      compiled = MapShaper.compileFeatureExpression(exp, arcs, shapes, records);

  var selectedShapes = [],
      selectedRecords = [],
      unselectedShapes = [],
      unselectedRecords = [],
      unselectedLyr;

  Utils.forEach(shapes, function(shp, shapeId) {
    var rec = records ? records[shapeId] : null,
        result = compiled(shapeId);

    if (!Utils.isBoolean(result)) {
      stop("--filter expressions must return true or false");
    }
    if (result) {
      selectedShapes.push(shp);
      if (records) selectedRecords.push(rec);
    } else if (!discard) {
      unselectedShapes.push(shp);
      if (records) unselectedRecords.push(rec);
    }
  });

  lyr.shapes = selectedShapes;
  if (records) {
    lyr.data = new DataTable(selectedRecords);
  }
  if (!discard) {
    unselectedLyr = {
      shapes: unselectedShapes,
      data: records ? new DataTable(unselectedRecords) : null
    };
    Opts.copyNewParams(unselectedLyr, lyr);
  }
  return unselectedLyr;
};
