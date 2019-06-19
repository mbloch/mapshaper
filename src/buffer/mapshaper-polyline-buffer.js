/* @requires
mapshaper-buffer-common
mapshaper-shape-iter
mapshaper-geodesic
mapshaper-geojson
mapshaper-path-buffer
mapshaper-path-buffer2
*/

internal.makePolylineBuffer = function(lyr, dataset, opts) {
  var geojson = internal.makeShapeBufferGeoJSON(lyr, dataset, opts);
  var dataset2 = internal.importGeoJSON(geojson, {});
  internal.dissolveBufferDataset(dataset2, opts);
  return dataset2;
};

internal.makeShapeBufferGeoJSON = function(lyr, dataset, opts) {
  var distanceFn = internal.getBufferDistanceFunction(lyr, dataset, opts);
  var toleranceFn = internal.getBufferToleranceFunction(dataset, opts);
  var geod = internal.getGeodeticSegmentFunction(dataset, false);
  var getBearing = internal.getBearingFunction(dataset);
  var makerOpts = utils.extend({geometry_type: lyr.geometry_type}, opts);
  var factory = opts.v2 ? internal.getPolylineBufferMaker2 : internal.getPolylineBufferMaker;
  var makeShapeBuffer = factory(dataset.arcs, geod, getBearing, makerOpts);
  var records = lyr.data ? lyr.data.getRecords() : null;
  var geometries = lyr.shapes.map(function(shape, i) {
    var dist = distanceFn(i);
    if (!dist || !shape) return null;
    return makeShapeBuffer(shape, dist, lyr.geometry_type);
  });
  // TODO: make sure that importer supports null geometries (not standard GeoJSON);
  return {
    type: 'GeometryCollection',
    geometries: geometries
  };
};

