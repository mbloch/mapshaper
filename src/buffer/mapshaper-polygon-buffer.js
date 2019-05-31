/* @requires mapshaper-buffer-common, mapshaper-polyline-buffer */

internal.makePolygonBuffer = function(lyr, dataset, opts) {
  var geojson = internal.makeShapeBufferGeoJSON(lyr, dataset, opts);
  return internal.importGeoJSON(geojson, {});
  // TODO: dissolve overlaps
};
