/* @require mapshaper-geodesic mapshaper-projections mapshaper-geojson mapshaper-units */

// returns a dataset
api.buffer = function(layers, dataset, opts) {
  // console.log("buffer", lyr)
  return internal.pointBuffer(layers[0], dataset, opts);
};

internal.pointBuffer = function(lyr, dataset, opts) {
  var geojson = internal.makePointBufferGeoJSON(lyr, dataset, opts);
  var dataset2 = internal.importGeoJSON(geojson, {});
  dataset2.layers[0].name = opts.name || lyr.name;
  return dataset2;
};

// return constant distance in meters, or return null if unparsable
internal.parseConstantBufferDistance = function(str, crs) {
  var parsed = internal.parseMeasure2(str);
  if (!parsed.value) return null;
  return internal.convertDistanceParam(str, crs) || null;
};

internal.getBufferDistanceFunction = function(lyr, dataset, opts) {
  if (!opts.radius) {
    stop('Missing expected radius parameter');
  }
  var unitStr = opts.units || '';
  var crs = internal.getDatasetCRS(dataset);
  var constDist = internal.parseConstantBufferDistance(opts.radius + unitStr, crs);
  if (constDist) return function() {return constDist;};
  var expr = internal.compileValueExpression(opts.radius, lyr, null, {}); // no arcs
  return function(shpId) {
    var val = expr(shpId);
    if (!val) return 0;
    // TODO: optimize common case that expression returns a number
    var dist = internal.parseConstantBufferDistance(val + unitStr, crs);
    return dist || 0;
  };
};

internal.makePointBufferGeoJSON = function(lyr, dataset, opts) {
  var vertices = opts.vertices || 72;
  var distanceFn = internal.getBufferDistanceFunction(lyr, dataset, opts);
  // var geod = internal.getDatasetCRS(dataset) ? internal.getGeodesic(dataset) : null;
  var geod = internal.getGeodeticSegmentFunction(dataset);
  var geometries = lyr.shapes.map(function(shape, i) {
    var dist = distanceFn(i);
    if (!dist) return null;
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
