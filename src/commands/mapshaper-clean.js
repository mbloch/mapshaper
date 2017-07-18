/* @requires mapshaper-dissolve2, mapshaper-polygon-mosaic */

api.clean2 = function(layers, dataset, opts) {
  layers.forEach(internal.requirePolygonLayer);
  var nodes = internal.addIntersectionCuts(dataset, opts);
  var out = internal.buildPolygonMosaic(nodes);
  if (out.collisions) {
    layers = layers.concat(internal.getCollisionLayer(out.collisions));
  }
  return layers;
};

internal.getCollisionLayer = function(arcs) {
  var lyr = {geometry_type: 'polyline'};
  var data = [];
  lyr.shapes = arcs.map(function(arcId) {
    data.push({ARCID: arcId});
    return [[arcId]];
  });
  lyr.data = new DataTable(data);
  return lyr;
};

// (This doesn't currently do much)
// TODO: remove small overlaps
// TODO: patch small gaps
api.cleanLayers = function(layers, dataset, opts) {
  var nodes = internal.addIntersectionCuts(dataset);
  var flatten = internal.getPolygonFlattener(nodes);

  layers.forEach(function(lyr) {
    internal.requirePolygonLayer(lyr);
    lyr.shapes = lyr.shapes.map(flatten);
  });
};


internal.getPolygonFlattener = function(nodes) {
  var flags = new Uint8Array(nodes.arcs.size());
  var divide = internal.getHoleDivider(nodes);
  var flatten = internal.getRingIntersector(nodes, 'flatten', flags);

  return function(shp) {
    if (!shp) return null;
    var cw = [],
        ccw = [];

    divide(shp, cw, ccw);
    cw = flatten(cw);
    ccw.forEach(internal.reversePath);
    ccw = flatten(ccw);
    ccw.forEach(internal.reversePath);

    var shp2 = internal.appendHolestoRings(cw, ccw);
    return shp2 && shp2.length > 0 ? shp2 : null;
  };
};
