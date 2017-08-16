/* @requires mapshaper-dissolve2, mapshaper-polygon-mosaic */

api.clean2 = function(layers, dataset, opts) {
  layers.forEach(internal.requirePolygonLayer);
  var nodes = internal.addIntersectionCuts(dataset, opts);
  var out = internal.buildPolygonMosaic(nodes);
  layers = layers.concat({
    geometry_type: 'polygon',
    name: 'mosaic',
    shapes: out.mosaic
  } , {
    geometry_type: 'polygon',
    name: 'enclosure',
    shapes: out.enclosures
  });
  if (out.lostArcs.length > 0) {
    layers = layers.concat(getDebugLayers(out.lostArcs, nodes.arcs));
  }
  return layers;

  function getDebugLayers(lostArcs, arcs) {
    var arcLyr = {geometry_type: 'polyline', name: 'debug', shapes: []};
    var pointLyr = {geometry_type: 'point', name: 'debug', shapes: []};
    var arcData = [];
    var pointData = [];
    lostArcs.forEach(function(arcId) {
      var first = arcs.getVertex(arcId, 0);
      var last = arcs.getVertex(arcId, -1);
      arcData.push({ARCID: arcId});
      arcLyr.shapes.push([[arcId]]);
      pointData.push({ARCID: arcId}, {ARCID: arcId});
      pointLyr.shapes.push([[first.x, first.y]], [[last.x, last.y]]);
    });
    arcLyr.data = new DataTable(arcData);
    pointLyr.data = new DataTable(pointData);
    return [arcLyr, pointLyr];
  }
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
