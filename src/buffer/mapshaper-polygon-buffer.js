import { dissolveBufferDataset } from '../buffer/mapshaper-buffer-common';
import { importGeoJSON } from '../geojson/geojson-import';
import { makeShapeBufferGeoJSON } from '../buffer/mapshaper-polyline-buffer';

export function makePolygonBuffer(lyr, dataset, opts) {
  var geojson = makeShapeBufferGeoJSON(lyr, dataset, opts);
  var dataset2 = importGeoJSON(geojson, {});
  dissolveBufferDataset(dataset2);
  return dataset2;
}
