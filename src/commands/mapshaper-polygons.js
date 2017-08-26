/* @requires mapshaper-dissolve2, mapshaper-polygon-mosaic, mapshaper-gaps */

api.polygons = function(layers, dataset, opts) {
  layers.forEach(internal.requirePolylineLayer);
  // use larger-than-default snapping in addIntersectionCuts()
  // (kludge, snaps together some almost-identical pairs of lines in ne_10m_land_ocean_seams.shp)
  // if (opts.gap_tolerance) {
    //opts = utils.defaults({snap_interval: opts.gap_tolerance * 0.1}, opts);
  // }
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
