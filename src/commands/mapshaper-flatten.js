/* @require mapshaper-polygon-intersection */

// Remove overlapping polygon shapes
// (Unfinished)

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
  MapShaper.openArcPathways(shapes, arcs, flags, true, true, false);

  var divide = MapShaper.getPathFinder(arcs, flags);
  var flattened = shapes.map(function(shape, i) {
    var dividedShape = [];

    MapShaper.forEachPath(shape, function(ids) {
      MapShaper.closeArcPathways(ids, arcs, flags, true); // close rev.
      // if path doubles back, closing rev. blocks the path... need to keep fwd open
      MapShaper.openArcPathways(ids, arcs, flags, true, false, false);
      var path;
      for (var i=0; i<ids.length; i++) {
        path = divide(ids[i]);
        if (path) {
          dividedShape.push(path);
        }
      }
      MapShaper.openArcPathways(ids, arcs, flags, false, true, false);

    });
    return dividedShape.length === 0 ? null : dividedShape;
  });

  return flattened;
};
