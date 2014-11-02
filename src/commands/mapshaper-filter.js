/* @requires mapshaper-expressions, mapshaper-shape-geom */

api.filterFeatures = function(lyr, arcs, opts) {
  var records = lyr.data ? lyr.data.getRecords() : null,
      filter = null;

  if (lyr.geometry_type == 'polygon') {
    if (opts.min_island_area) {
      MapShaper.editShapes(lyr.shapes, MapShaper.getIslandAreaFilter(arcs, opts.min_island_area));
    }
    if (opts.min_island_vertices) {
      MapShaper.editShapes(lyr.shapes, MapShaper.getIslandVertexFilter(arcs, opts.min_island_vertices));
    }
  }

  if (opts.expression) {
    filter = MapShaper.compileFeatureExpression(opts.expression, lyr, arcs);
  }

  if (opts.empty) {
    filter = MapShaper.combineFilters(filter, MapShaper.getNullGeometryFilter(lyr, arcs));
  }

  if (!filter) {
    message("[filter] missing a filter -- retaining all features");
    return;
  }

  var selectedShapes = [],
      selectedRecords = [];

  Utils.forEach(lyr.shapes, function(shp, shapeId) {
    var rec = records ? records[shapeId] : null,
        result = filter(shapeId);

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

MapShaper.filterDataTable = function(data, exp) {
  var compiled = MapShaper.compileFeatureExpression(exp, {data: data}, null),
      filtered = Utils.filter(data.getRecords(), function(rec, i) {
        return compiled(i);
      });
  return new DataTable(filtered);
};

MapShaper.getIslandVertexFilter = function(arcs, minVertices) {
  var minCount = minVertices + 1; // first and last vertex in ring count as one
  return function(paths) {
    return MapShaper.editPaths(paths, function(path) {
      if (path.length == 1 && geom.countVerticesInPath(path, arcs) < minCount) {
        return null;
      }
    });
  };
};

MapShaper.getPathAreaFunction = function(arcs) {
  var areaFunction = MapShaper.probablyDecimalDegreeBounds(arcs.getBounds()) ?
        geom.getSphericalPathArea : geom.getPathArea;
  return function(path) {
    return areaFunction(arcs.getShapeIter(path));
  };
};

MapShaper.getIslandAreaFilter = function(arcs, minArea) {
  var pathArea = MapShaper.getPathAreaFunction(arcs);
  return function(paths) {
    return MapShaper.editPaths(paths, function(path) {
      if (path.length == 1 && Math.abs(pathArea(path)) < minArea) {
        return null;
      }
    });
  };
};

MapShaper.editShapes = function(shapes, filter) {
  for (var i=0, n=shapes.length; i<n; i++) {
    shapes[i] = filter(shapes[i]);
  }
};
