import { isLatLngCRS } from '../crs/mapshaper-projections';
import { isRotatedWorldProjection } from '../crs/mapshaper-proj-info';
import { importGeoJSON } from '../geojson/geojson-import';
import { clipLayers } from '../commands/mapshaper-clip-erase';
import { layerHasPaths } from '../dataset/mapshaper-layer-utils';
import { getAntimeridian } from '../geom/mapshaper-latlon';

export function insertPreProjectionCuts(dataset, src, dest) {
  if (isLatLngCRS(src) && isRotatedWorldProjection(dest)) {
    insertVerticalCut(dataset, getAntimeridian(dest.lam0 * 180 / Math.PI));
    return true;
  }
  return false;
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


