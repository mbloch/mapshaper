/* @requires mapshaper-dissolve2 */

// Flatten overlapping polygon shapes
// (Unfinished)
api.flattenLayer = function(lyr, dataset, opts) {
  var nodes = MapShaper.divideArcs(dataset);
  var flatten = MapShaper.getPolygonFlattener(nodes);
  var lyr2 = {data: null};
  lyr2.shapes = lyr.shapes.map(flatten);
  // TODO: copy data over
  return utils.defaults(lyr2, lyr);
};

MapShaper.getPolygonFlattener = function(nodes) {
  var flags = new Uint8Array(nodes.arcs.size());
  var divide = MapShaper.getHoleDivider(nodes);
  var flatten = MapShaper.getRingIntersector(nodes, 'flatten', flags);

  return function(shp) {
    if (!shp) return null;
    var cw = [],
        ccw = [];

    divide(shp, cw, ccw);
    cw = flatten(cw);
    ccw.forEach(MapShaper.reversePath);
    ccw = flatten(ccw);
    ccw.forEach(MapShaper.reversePath);

    var shp2 = MapShaper.appendHolestoRings(cw, ccw);
    return shp2 && shp2.length > 0 ? shp2 : null;
  };
};