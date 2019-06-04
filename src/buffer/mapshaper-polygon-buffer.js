/* @requires mapshaper-buffer-common, mapshaper-polyline-buffer, mapshaper-geojson */

internal.makePolygonBuffer = function(lyr, dataset, opts) {
  var geojson = internal.makeShapeBufferGeoJSON(lyr, dataset, opts);
  var dataset2 = internal.importGeoJSON(geojson, {});
  internal.dissolveBufferDataset(dataset2);
  return dataset2;
};
