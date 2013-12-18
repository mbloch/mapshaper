/* @requires mapshaper-expressions */

MapShaper.filterLayers = function(layers, arcs, exp) {
  T.start();
  Utils.forEach(layers, function(lyr) {
    MapShaper.filter(lyr, arcs, exp);
  });
  T.stop("Filter");
};

MapShaper.selectLayers = function(layers, arcs, exp) {
  var unselected = [], tmp;
  Utils.forEach(layers, function(lyr) {
    tmp = MapShaper.filter(lyr, arc, exp);
    if (tmp && tmp.shapes.length > 0) {
      unselected.push(tmp);
    }
  });
  return unselected;
};

MapShaper.filter = function(lyr, arcs, exp) {
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
