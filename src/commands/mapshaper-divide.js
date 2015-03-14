/* @require mapshaper-polygon-intersection */

// Assumes layers and arcs have been processed with divideArcs()
/*
api.dividePolygonLayer = function(lyrA, lyrB, arcs) {
  if (lyrA.geometry_type != 'polygon') {
    stop("[dividePolygonLayer()] Expected polygon layer, received:", lyrA.geometry_type);
  }
  var flags = new Uint8Array(arcs.size());
  MapShaper.openArcRoutes(lyrA.shapes, arcs, flags, true, false, false);
  MapShaper.openArcRoutes(lyrB.shapes, arcs, flags, true, true, false);

  var dividedShapes = MapShaper.dividePolygons(lyrA.shapes, arcs, flags);
  return utils.defaults({shapes: dividedShapes, data: null}, lyrA);
};

MapShaper.dividePolygons = function(shapes, arcs, flags) {
  var divide = MapShaper.getPathFinder(nodes, flags);
  return shapes.map(function(shape, i) {
    var dividedShape = [];
    MapShaper.forEachPath(shape, function(ids) {
      var path;
      for (var i=0; i<ids.length; i++) {
        path = divide(ids[i]);
        if (path) {
          dividedShape.push(path);
        }
      }
    });
    return dividedShape.length === 0 ? null : dividedShape;
  });
};
*/
