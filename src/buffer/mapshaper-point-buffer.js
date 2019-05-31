/* @requires mapshaper-buffer-common */

internal.makePointBuffer = function(lyr, dataset, opts) {
  var geojson = internal.makePointBufferGeoJSON(lyr, dataset, opts);
  return internal.importGeoJSON(geojson, {});
};

internal.makePointBufferGeoJSON = function(lyr, dataset, opts) {
  var vertices = opts.vertices || 72;
  var distanceFn = internal.getBufferDistanceFunction(lyr, dataset, opts);
  var geod = internal.getGeodeticSegmentFunction(dataset);
  var geometries = lyr.shapes.map(function(shape, i) {
    var dist = distanceFn(i);
    if (!dist || !shape) return null;
    return internal.getPointBufferGeometry(shape, dist, vertices, geod);
  });
  // TODO: make sure that importer supports null geometries (not standard GeoJSON);
  return {
    type: 'GeometryCollection',
    geometries: geometries
  };
};

internal.getPointBufferGeometry = function(points, distance, vertices, geod) {
  var coordinates = [];
  if (!points || !points.length) return null;
  for (var i=0; i<points.length; i++) {
    coordinates.push(internal.getPointBufferPolygonCoordinates(points[i], distance, vertices, geod));
  }
  return coordinates.length == 1 ? {
    type: 'Polygon',
    coordinates: coordinates[0]
  } : {
    type: 'MultiPolygon',
    coordinates: coordinates
  };
};

internal.getPointBufferPolygonCoordinates = function(p, meterDist, vertices, geod) {
  var coords = [],
      angle = 360 / vertices;
  for (var i=0; i<vertices; i++) {
    coords.push(geod(p[0], p[1], i * angle, meterDist));
  }
  coords.push(coords[0].concat());
  return [coords]; // return vertices as the first (space-enclosing) ring of a Polygon geometry
};
