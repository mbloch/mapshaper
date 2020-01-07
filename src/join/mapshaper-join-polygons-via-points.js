/* @require mapshaper-point-polygon-join */

internal.joinPolygonsViaPoints = function(targetLyr, targetDataset, source, opts) {

  var sourceLyr = source.layer,
      sourceDataset = source.dataset,
      pointLyr, retn;

  if (targetLyr.shapes.length > sourceLyr.shapes.length) {
    // convert target polygons to points, then join source data to points
    pointLyr = internal.pointsFromPolygonsForJoin(targetLyr, targetDataset);
    retn = api.joinPolygonsToPoints(pointLyr, sourceLyr, sourceDataset.arcs, opts);
    targetLyr.data = pointLyr.data;
  } else {
    // convert source polygons to points, then join points to target polygons
    pointLyr = internal.pointsFromPolygonsForJoin(sourceLyr, sourceDataset);
    retn = api.joinPointsToPolygons(targetLyr, targetDataset.arcs, pointLyr, opts);
  }
  return retn;
};

internal.pointsFromPolygonsForJoin = function(lyr, dataset) {
  // TODO use faster method to get inner points
  return {
    geometry_type: 'point',
    shapes: internal.pointsFromPolygons(lyr, dataset.arcs, {inner: true}),
    data: lyr.data // TODO copy if needed
  };
};
