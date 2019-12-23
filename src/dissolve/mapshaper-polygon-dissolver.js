/* @requires
mapshaper-pathfinder
mapshaper-polygon-holes
mapshaper-dissolve
mapshaper-data-aggregation
mapshaper-ring-nesting
*/

// TODO: remove this obsolete dissolve code (still used by clip)

internal.concatShapes = function(shapes) {
  return shapes.reduce(function(memo, shape) {
    internal.extendShape(memo, shape);
    return memo;
  }, []);
};

internal.extendShape = function(dest, src) {
  if (src) {
    for (var i=0, n=src.length; i<n; i++) {
      dest.push(src[i]);
    }
  }
};

// TODO: to prevent invalid holes,
// could erase the holes from the space-enclosing rings.
internal.appendHolesToRings = function(cw, ccw) {
  for (var i=0, n=ccw.length; i<n; i++) {
    cw.push(ccw[i]);
  }
  return cw;
};

internal.getPolygonDissolver = function(nodes, spherical) {
  spherical = spherical && !nodes.arcs.isPlanar();
  var flags = new Uint8Array(nodes.arcs.size());
  var divide = internal.getHoleDivider(nodes, spherical);
  var pathfind = internal.getRingIntersector(nodes, flags);

  return function(shp) {
    if (!shp) return null;
    var cw = [],
        ccw = [];

    divide(shp, cw, ccw);
    cw = pathfind(cw, 'flatten');
    ccw.forEach(internal.reversePath);
    ccw = pathfind(ccw, 'flatten');
    ccw.forEach(internal.reversePath);
    var shp2 = internal.appendHolesToRings(cw, ccw);
    var dissolved = pathfind(shp2, 'dissolve');

    if (dissolved.length > 1) {
      dissolved = internal.fixNestingErrors(dissolved, nodes.arcs);
    }

    return dissolved.length > 0 ? dissolved : null;
  };
};
