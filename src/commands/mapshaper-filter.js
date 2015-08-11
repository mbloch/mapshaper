/* @requires mapshaper-expressions, mapshaper-shape-geom, mapshaper-shape-utils */

api.filterFeatures = function(lyr, arcs, opts) {
  var records = lyr.data ? lyr.data.getRecords() : null,
      shapes = lyr.shapes || null,
      n = MapShaper.getFeatureCount(lyr),
      filteredShapes = shapes ? [] : null,
      filteredRecords = records ? [] : null,
      filteredLyr = MapShaper.getOutputLayer(lyr, opts),
      filter;

  if (opts.expression) {
    filter = MapShaper.compileFeatureExpression(opts.expression, lyr, arcs);
  }

  if (opts.remove_empty) {
    filter = MapShaper.combineFilters(filter, MapShaper.getNullGeometryFilter(lyr, arcs));
  }

  if (!filter) {
    stop("[filter] Missing a filter expression");
  }

  utils.repeat(n, function(shapeId) {
    var result = filter(shapeId);
    if (result === true) {
      if (shapes) filteredShapes.push(shapes[shapeId] || null);
      if (records) filteredRecords.push(records[shapeId] || null);
    } else if (result !== false) {
      stop("[filter] Expressions must return true or false");
    }
  });

  filteredLyr.shapes = filteredShapes;
  filteredLyr.data = filteredRecords ? new DataTable(filteredRecords) : null;
  if (opts.no_replace) {
    // if adding a layer, don't share objects between source and filtered layer
    filteredLyr = MapShaper.copyLayer(filteredLyr);
  }

  if (opts.verbose !== false) {
    message(utils.format('[filter] Retained %,d of %,d features', MapShaper.getFeatureCount(filteredLyr), n));
  }

  return filteredLyr;
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
    return !!shp && geom.getPlanarShapeArea(shapes[i], arcs) > 0;
  };
};

MapShaper.combineFilters = function(a, b) {
  return (a && b && function(id) {
      return a(id) && b(id);
    }) || a || b;
};
