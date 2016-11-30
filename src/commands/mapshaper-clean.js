/* @requires mapshaper-dissolve2 */

// (This doesn't currently do much)
// TODO: remove small overlaps
// TODO: patch small gaps
api.cleanLayers = function(layers, dataset, opts) {
  var nodes = MapShaper.addIntersectionCuts(dataset);
  var flatten = MapShaper.getPolygonFlattener(nodes);

  layers.forEach(function(lyr) {
    MapShaper.requirePolygonLayer(lyr, "[clean] Expected a polygon type layer");
    lyr.shapes = lyr.shapes.map(flatten);
  });
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
