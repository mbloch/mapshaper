import { clipLayers } from '../commands/mapshaper-clip-erase';
import { importGeoJSON } from '../geojson/geojson-import';

// type: 'clip' or 'erase'
export function clipLayersByGeoJSON(layers, dataset, geojson, typeArg) {
  var clipDataset = importGeoJSON(geojson, {});
  var type = typeArg || 'clip';
  var clip = {
    layer: clipDataset.layers[0],
    dataset: clipDataset
  };
  var outputLayers = clipLayers(layers, clip, dataset, type, {});
  layers.forEach(function(lyr, i) {
    var lyr2 = outputLayers[i];
    lyr.shapes = lyr2.shapes;
    lyr.data = lyr2.data;
  });

}