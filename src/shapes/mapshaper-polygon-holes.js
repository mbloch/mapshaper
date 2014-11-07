/* @require mapshaper-polygon-intersection, mapshaper-self-intersection */

// Returns a function that separates rings in a polygon into space-enclosing rings
// and holes. Also fixes self-intersections.
//
MapShaper.getHoleDivider = function(nodes) {
  var split = MapShaper.getSelfIntersectionSplitter(nodes);

  return function(rings, cw, ccw) {
    MapShaper.forEachPath(rings, function(ringIds) {
      var splitRings = split(ringIds);
      if (splitRings.length === 0) {
        trace("[getRingDivider()] Defective path:", ringIds);
      }
      splitRings.forEach(function(ringIds, i) {
        var ringArea = geom.getPathArea4(ringIds, nodes.arcs);
        if (ringArea > 0) {
          cw.push(ringIds);
        } else if (ringArea < 0) {
          ccw.push(ringIds);
        }
      });
    });
  };
};
