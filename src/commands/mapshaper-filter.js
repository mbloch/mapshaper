/* @requires mapshaper-expressions, mapshaper-shape-geom, mapshaper-shape-utils */

api.filterFeatures = function(lyr, arcs, opts) {
  var records = lyr.data ? lyr.data.getRecords() : null,
      shapes = lyr.shapes || null,
      n = internal.getFeatureCount(lyr),
      filteredShapes = shapes ? [] : null,
      filteredRecords = records ? [] : null,
      filteredLyr = internal.getOutputLayer(lyr, opts),
      filter;

  if (opts.expression) {
    filter = internal.compileValueExpression(opts.expression, lyr, arcs);
  }

  if (opts.remove_empty) {
    filter = internal.combineFilters(filter, internal.getNullGeometryFilter(lyr, arcs));
  }

  if (!filter) {
    stop("Missing a filter expression");
  }

  utils.repeat(n, function(shapeId) {
    var result = filter(shapeId);
    if (result === true) {
      if (shapes) filteredShapes.push(shapes[shapeId] || null);
      if (records) filteredRecords.push(records[shapeId] || null);
    } else if (result !== false) {
      stop("Expression must return true or false");
    }
  });

  filteredLyr.shapes = filteredShapes;
  filteredLyr.data = filteredRecords ? new DataTable(filteredRecords) : null;
  if (opts.no_replace) {
    // if adding a layer, don't share objects between source and filtered layer
    filteredLyr = internal.copyLayer(filteredLyr);
  }

  if (opts.verbose !== false) {
    message(utils.format('Retained %,d of %,d features', internal.getFeatureCount(filteredLyr), n));
  }

  return filteredLyr;
};

internal.getNullGeometryFilter = function(lyr, arcs) {
  var shapes = lyr.shapes;
  if (lyr.geometry_type == 'polygon') {
    return internal.getEmptyPolygonFilter(shapes, arcs);
  }
  return function(i) {return !!shapes[i];};
};

internal.getEmptyPolygonFilter = function(shapes, arcs) {
  return function(i) {
    var shp = shapes[i];
    return !!shp && geom.getPlanarShapeArea(shapes[i], arcs) > 0;
  };
};

internal.combineFilters = function(a, b) {
  return (a && b && function(id) {
      return a(id) && b(id);
    }) || a || b;
};
