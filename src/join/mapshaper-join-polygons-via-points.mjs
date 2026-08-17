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
  return {
    geometry_type: 'point',
    // Joins only require a reliable interior point; centroid bias adds a
    // second search without improving the containment test.
    shapes: pointsFromPolygons(lyr, dataset.arcs, {
      inner: true,
      inner_method: 'pole'
    }),
    data: lyr.data // TODO copy if needed
  };
}
