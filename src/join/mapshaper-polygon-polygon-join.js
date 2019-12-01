/*
@requires mapshaper-join-polygons-via-points mapshaper-join-polygons-via-mosaic
*/

internal.joinPolygonsToPolygons = function(targetLyr, targetDataset, source, opts) {
  if (opts.point_method) {
    return internal.joinPolygonsViaPoints(targetLyr, targetDataset, source, opts);
  } else {
    return internal.joinPolygonsViaMosaic(targetLyr, targetDataset, source, opts);
  }
};
