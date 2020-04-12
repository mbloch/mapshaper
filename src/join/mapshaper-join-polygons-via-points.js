import { pointsFromPolygons } from '../commands/mapshaper-points';
import { joinPolygonsToPoints, joinPointsToPolygons } from '../join/mapshaper-point-polygon-join';
export function joinPolygonsViaPoints(targetLyr, targetDataset, source, opts) {

  var sourceLyr = source.layer,
      sourceDataset = source.dataset,
      pointLyr, retn;

  if (targetLyr.shapes.length > sourceLyr.shapes.length) {
    // convert target polygons to points, then join source data to points
    pointLyr = pointsFromPolygonsForJoin(targetLyr, targetDataset);
    retn = joinPolygonsToPoints(pointLyr, sourceLyr, sourceDataset.arcs, opts);
    targetLyr.data = pointLyr.data;
  } else {
    // convert source polygons to points, then join points to target polygons
    pointLyr = pointsFromPolygonsForJoin(sourceLyr, sourceDataset);
    retn = joinPointsToPolygons(targetLyr, targetDataset.arcs, pointLyr, opts);
  }
  return retn;
}

function pointsFromPolygonsForJoin(lyr, dataset) {
  // TODO use faster method to get inner points
  return {
    geometry_type: 'point',
    shapes: pointsFromPolygons(lyr, dataset.arcs, {inner: true}),
    data: lyr.data // TODO copy if needed
  };
}
