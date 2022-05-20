import { joinPolygonsViaMosaic } from '../join/mapshaper-join-polygons-via-mosaic';
import { joinPolygonsViaPoints } from '../join/mapshaper-join-polygons-via-points';

export function joinPolygonsToPolygons(targetLyr, targetDataset, source, opts) {
  if (opts.point_method) {
    return joinPolygonsViaPoints(targetLyr, targetDataset, source, opts);
  } else {
    return joinPolygonsViaMosaic(targetLyr, targetDataset, source, opts);
  }
}
