/* @requires mapshaper-dissolve2, mapshaper-polygon-mosaic, mapshaper-gaps */

api.polygons = function(layers, dataset, opts) {
  layers.forEach(internal.requirePolylineLayer);
  internal.addIntersectionCuts(dataset, opts);
  return layers.map(function(lyr) {
    if (lyr.geometry_type != 'polyline') stop("Expected a polyline layer");
    return internal.createPolygonLayer(lyr, dataset, opts);
  });
};

internal.createPolygonLayer = function(lyr, dataset, opts) {
  var nodes = internal.closeGaps(lyr, dataset, opts);
  var data;
  nodes.detachAcyclicArcs();
  data = internal.buildPolygonMosaic(nodes);
  return {
    geometry_type: 'polygon',
    name: lyr.name,
    shapes: data.mosaic
  };
};
