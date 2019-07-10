/* @require
mapshaper-self-intersection
mapshaper-shape-utils
mapshaper-shape-geom
*/
// __mapshaper-self-intersection-v1

// TODO: also delete positive-space rings nested inside holes
internal.deleteHoles = function(lyr, arcs) {
  internal.editShapes(lyr.shapes, function(path) {
    if (geom.getPathArea(path, arcs) <= 0) {
      return null; // null deletes the path
    }
  });
};

// Returns a function that separates rings in a polygon into space-enclosing rings
// and holes. Also fixes self-intersections.
//
internal.getHoleDivider = function(nodes, spherical) {
  var split = internal.getSelfIntersectionSplitter(nodes);
  // var split = internal.getSelfIntersectionSplitter_v1(nodes); console.log('split')

  return function(rings, cw, ccw) {
    var pathArea = spherical ? geom.getSphericalPathArea : geom.getPlanarPathArea;
    internal.forEachShapePart(rings, function(ringIds) {
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
