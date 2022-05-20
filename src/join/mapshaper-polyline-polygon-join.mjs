import { polylineToMidpoints } from '../paths/mapshaper-polyline-to-point';
import { joinPolygonsToPoints, joinPointsToPolygons } from '../join/mapshaper-point-polygon-join';
import { stop } from '../utils/mapshaper-logging';

function pointsFromPolylinesForJoin(lyr, dataset) {
  var shapes = lyr.shapes.map(function(shp) {
    return polylineToMidpoints(shp, dataset.arcs);
  });
  return {
    geometry_type: 'point',
    shapes: shapes,
    data: lyr.data // TODO copy if needed
  };
}

function validateOpts(opts) {
  if (!opts.point_method) {
    stop('The "point-method" flag is required for polyline-polygon joins');
  }
}

export function joinPolylinesToPolygons(targetLyr, targetDataset, source, opts) {
  validateOpts(opts);
  var pointLyr = pointsFromPolylinesForJoin(source.layer, source.dataset);
  var retn = joinPointsToPolygons(targetLyr, targetDataset.arcs, pointLyr, opts);
  return retn;
}

export function joinPolygonsToPolylines(targetLyr, targetDataset, source, opts) {
  validateOpts(opts);
  var pointLyr = pointsFromPolylinesForJoin(targetLyr, targetDataset);
  var retn = joinPolygonsToPoints(pointLyr, source.layer, source.dataset.arcs, opts);
  targetLyr.data = pointLyr.data;
  return retn;
}
