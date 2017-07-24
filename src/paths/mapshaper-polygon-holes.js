/* @require mapshaper-self-intersection */

// Returns a function that separates rings in a polygon into space-enclosing rings
// and holes. Also fixes self-intersections.
//
internal.getHoleDivider = function(nodes, spherical) {
  var split = internal.getSelfIntersectionSplitter(nodes);

  return function(rings, cw, ccw) {
    var pathArea = spherical ? geom.getSphericalPathArea : geom.getPlanarPathArea;
    internal.forEachPath(rings, function(ringIds) {
      var splitRings = split(ringIds);
      if (splitRings.length === 0) {
        debug("[getRingDivider()] Defective path:", ringIds);
      }
      splitRings.forEach(function(ringIds, i) {
        var ringArea = pathArea(ringIds, nodes.arcs);
        if (ringArea > 0) {
          cw.push(ringIds);
        } else if (ringArea < 0) {
          ccw.push(ringIds);
        }
      });
    });
  };
};
