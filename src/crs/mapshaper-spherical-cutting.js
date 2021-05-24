import { isLatLngCRS } from '../crs/mapshaper-projections';
import { isRotatedNormalProjection } from '../crs/mapshaper-proj-info';
import { layerHasPaths } from '../dataset/mapshaper-layer-utils';
import { getAntimeridian } from '../geom/mapshaper-latlon';
import { clipLayersInPlace } from '../commands/mapshaper-clip-erase';
import { importGeoJSON } from '../geojson/geojson-import';
import { convertBboxToGeoJSON } from '../commands/mapshaper-rectangle';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';

export function insertPreProjectionCuts(dataset, src, dest) {
  var antimeridian = getAntimeridian(dest.lam0 * 180 / Math.PI);
  // currently only supports adding a single vertical cut to earth axis-aligned
  // map projections centered on a non-zero longitude.
  // TODO: need a more sophisticated kind of cutting to handle other cases
  if (isLatLngCRS(src) &&
      isRotatedNormalProjection(dest) &&
      datasetCrossesLon(dataset, antimeridian)) {
    insertVerticalCut(dataset, antimeridian);
    dissolveArcs(dataset);
    return true;
  }
  return false;
}

function datasetCrossesLon(dataset, lon) {
  var crosses = 0;
  dataset.arcs.forEachSegment(function(i, j, xx, yy) {
    var ax = xx[i],
        bx = xx[j];
    if (ax <= lon && bx >= lon || ax >= lon && bx <= lon) crosses++;
  });
  return crosses > 0;
}

function insertVerticalCut(dataset, lon) {
  var pathLayers = dataset.layers.filter(layerHasPaths);
  if (pathLayers.length === 0) return;
  var e = 1e-8;
  var bbox = [lon-e, -91, lon+e, 91];
  // densify (so cut line can curve, e.g. Cupola projection)
  var geojson = convertBboxToGeoJSON(bbox, {interval: 0.5});
  var clip = importGeoJSON(geojson);
  clipLayersInPlace(pathLayers, clip, dataset, 'erase');
}
