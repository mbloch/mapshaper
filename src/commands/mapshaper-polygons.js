/* @requires mapshaper-intersection-cuts, mapshaper-polygon-mosaic, mapshaper-undershoots */

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
    if (opts.from_rings) {
      return internal.createPolygonLayerFromRings(lyr, dataset);
    }
    return internal.createPolygonLayer(lyr, dataset, opts);
  });
};

// Convert a polyline layer of rings to a polygon layer
internal.createPolygonLayerFromRings = function(lyr, dataset) {
  var arcs = dataset.arcs;
  var openCount = 0;
  internal.editShapes(lyr.shapes, function(part) {
    if (geom.pathIsClosed(part, arcs)) {
      return part;
    }
    openCount++;
    return null;
  });
  if (openCount > 0) {
    message('Removed', openCount, 'open ' + (openCount == 1 ? 'ring' : 'rings'));
  }
  lyr.geometry_type = 'polygon';
  internal.rewindPolygons(lyr, arcs);
  return lyr;
};

internal.createPolygonLayer = function(lyr, dataset, opts) {
  var nodes = internal.closeUndershoots(lyr, dataset, opts);
  var data = internal.buildPolygonMosaic(nodes);
  return {
    geometry_type: 'polygon',
    name: lyr.name,
    shapes: data.mosaic
  };
};
