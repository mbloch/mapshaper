import { isLatLngCRS } from '../crs/mapshaper-projections';
import { isRotatedNormalProjection } from '../crs/mapshaper-proj-info';
import { importGeoJSON } from '../geojson/geojson-import';
import { clipLayers } from '../commands/mapshaper-clip-erase';
import { layerHasPaths } from '../dataset/mapshaper-layer-utils';
import { getAntimeridian } from '../geom/mapshaper-latlon';

export function insertPreProjectionCuts(dataset, src, dest) {
  var antimeridian = getAntimeridian(dest.lam0 * 180 / Math.PI);
  // currently only supports adding a single vertical cut to earth axis-aligned
  // map projections centered on a non-zero longitude.
  // TODO: need a more sophisticated kind of cutting to handle other cases
  if (isLatLngCRS(src) &&
      isRotatedNormalProjection(dest) &&
      datasetCrossesLon(dataset, antimeridian)) {
    insertVerticalCut(dataset, antimeridian);
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
  var e =1e-8;
  var coords = [[lon+e, 90], [lon+e, -90], [lon-e, -90], [lon-e, 90], [lon+e, 90]];
  var geojson = {
    type: 'Polygon',
    coordinates: [coords]
  };
  var clipDataset = importGeoJSON(geojson, {});
  var clip = {
    layer: clipDataset.layers[0],
    dataset: clipDataset
  };
  var outputLayers = clipLayers(pathLayers, clip, dataset, 'erase', {});
  pathLayers.forEach(function(lyr, i) {
    var lyr2 = outputLayers[i];
    lyr.shapes = lyr2.shapes;
    lyr.data = lyr2.data;
  });
}


