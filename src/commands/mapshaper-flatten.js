/* @require mapshaper-polygon-intersection */

// Remove overlapping polygon shapes
// (Unfinished)
/*
api.flattenLayer = function(lyr, arcs, opts) {
  // MapShaper.divideArcs([lyr], arcs);
  var shapes = MapShaper.flattenShapes(lyr.shapes, arcs);
  var lyr2 = Utils.defaults({shapes: shapes, data: null}, lyr);
  return lyr2;
};

MapShaper.flattenShapes = function(shapes, arcs) {
  // remove spikes
  shapes.forEach(function(shape) {
    MapShaper.forEachPath(shape, MapShaper.removeSpikesInPath);
  });

  var flags = new Uint8Array(arcs.size());
  MapShaper.openArcRoutes(shapes, arcs, flags, true, true, false);

  var divide = MapShaper.getPathFinder(arcs, flags);
  var flattened = shapes.map(function(shape, i) {
    var dividedShape = [];

    MapShaper.forEachPath(shape, function(ids) {
      MapShaper.closeArcRoutes(ids, arcs, flags, true); // close rev.
      // if path doubles back, closing rev. blocks the path... need to keep fwd open
      MapShaper.openArcRoutes(ids, arcs, flags, true, false, false);
      var path;
      for (var i=0; i<ids.length; i++) {
        path = divide(ids[i]);
        if (path) {
          dividedShape.push(path);
        }
      }
      MapShaper.openArcRoutes(ids, arcs, flags, false, true, false);

    });
    return dividedShape.length === 0 ? null : dividedShape;
  });

  return flattened;
};
*/
