/* @require mapshaper-point-polygon-join */

internal.joinPolygonsViaPoints = function(targetLyr, targetDataset, source, opts) {

  var sourceLyr = source.layer,
      sourceDataset = source.dataset,
      pointLyr;

  if (targetLyr.shapes.length > sourceLyr.shapes.length) {
    // convert target polygons to points
    pointLyr = internal.pointsFromPolygonsForJoin(targetLyr, targetDataset);
    return api.joinPolygonsToPoints(targetLyr, sourceLyr, sourceDataset.arcs, opts);
  } else {
    // convert source polygons to points
    pointLyr = internal.pointsFromPolygonsForJoin(sourceLyr, sourceDataset);
    return api.joinPointsToPolygons(targetLyr, targetDataset.arcs, pointLyr, opts);
  }
};

internal.pointsFromPolygonsForJoin = function(lyr, dataset) {
  // TODO use faster method to get inner points
  return {
    geometry_type: 'point',
    shapes: internal.pointsFromPolygons(lyr, dataset.arcs, {inner: true}),
    data: lyr.data // TODO copy if needed
  };
};
