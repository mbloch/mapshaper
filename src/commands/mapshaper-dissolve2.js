/* @requires mapshaper-flatten, mapshaper-divide */

MapShaper.dissolveShapes = function(shapes, arcs) {
  var dividedShapes = MapShaper.flattenShapes(shapes, arcs);

  var flags = new Uint8Array(arcs.size());
  MapShaper.openArcRoutes(dividedShapes, arcs, flags, true, false, true);

  var dissolvedShapes = MapShaper.dividePolygons(dividedShapes, arcs, flags);
  dissolvedShapes = Utils.filter(dissolvedShapes, function(shp) { return !!shp; });

  return dissolvedShapes;
};

api.dissolvePolygons2 = function(lyr, arcs, opts) {
  // add intersection points, to avoid rare topology issues
  // MapShaper.divideArcs([lyr], arcs);

  var dissolvedShapes = MapShaper.dissolveShapes(lyr.shapes, arcs);
  return Utils.defaults({shapes: dissolvedShapes, data: null}, lyr);
};
