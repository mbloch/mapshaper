/* @requires mapshaper-expressions, mapshaper-shape-geom */

api.filterFeatures = function(lyr, arcs, opts) {
  var records = lyr.data ? lyr.data.getRecords() : null,
      shapes = lyr.shapes || null,
      size = MapShaper.getFeatureCount(lyr),
      filter = null;

  if (opts.expression) {
    filter = MapShaper.compileFeatureExpression(opts.expression, lyr, arcs);
  }

  if (opts.remove_empty) {
    filter = MapShaper.combineFilters(filter, MapShaper.getNullGeometryFilter(lyr, arcs));
  }

  if (!filter) {
    message("[filter] missing a filter -- retaining all features");
    return;
  }

  var selectedShapes = [],
      selectedRecords = [];
  utils.repeat(size, function(shapeId) {
    var result = filter(shapeId);
    if (result === true) {
      if (shapes) selectedShapes.push(shapes[shapeId] || null);
      if (records) selectedRecords.push(records[shapeId] || null);
    } else if (result !== false) {
      stop("[filter] Expressions must return true or false");
    }
  });

  if (shapes) {
    lyr.shapes = selectedShapes;
  }
  if (records) {
    lyr.data = new DataTable(selectedRecords);
  }
};

MapShaper.getNullGeometryFilter = function(lyr, arcs) {
  var shapes = lyr.shapes;
  if (lyr.geometry_type == 'polygon') {
    return MapShaper.getEmptyPolygonFilter(shapes, arcs);
  }
  return function(i) {return !!shapes[i];};
};

MapShaper.getEmptyPolygonFilter = function(shapes, arcs) {
  return function(i) {
    var shp = shapes[i];
    return !!shp && geom.getShapeArea(shapes[i], arcs) > 0;
  };
};

MapShaper.combineFilters = function(a, b) {
  return (a && b && function(id) {
      return a(id) && b(id);
    }) || a || b;
};
