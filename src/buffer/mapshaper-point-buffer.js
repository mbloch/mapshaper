import { getGeodeticSegmentFunction } from '../geom/mapshaper-geodesic';
import { getBufferDistanceFunction } from '../buffer/mapshaper-buffer-common';
import { importGeoJSON } from '../geojson/geojson-import';

export function makePointBuffer(lyr, dataset, opts) {
  var geojson = makePointBufferGeoJSON(lyr, dataset, opts);
  return importGeoJSON(geojson, {});
}

function makePointBufferGeoJSON(lyr, dataset, opts) {
  var vertices = opts.vertices || 72;
  var distanceFn = getBufferDistanceFunction(lyr, dataset, opts);
  var geod = getGeodeticSegmentFunction(dataset);
  var geometries = lyr.shapes.map(function(shape, i) {
    var dist = distanceFn(i);
    if (!dist || !shape) return null;
    return getPointBufferGeometry(shape, dist, vertices, geod);
  });
  // TODO: make sure that importer supports null geometries (nonstandard GeoJSON);
  return {
    type: 'GeometryCollection',
    geometries: geometries
  };
}

function getPointBufferGeometry(points, distance, vertices, geod) {
  var coordinates = [];
  if (!points || !points.length) return null;
  for (var i=0; i<points.length; i++) {
    coordinates.push(getPointBufferPolygonCoordinates(points[i], distance, vertices, geod));
  }
  return coordinates.length == 1 ? {
    type: 'Polygon',
    coordinates: coordinates[0]
  } : {
    type: 'MultiPolygon',
    coordinates: coordinates
  };
}

function getPointBufferPolygonCoordinates(p, meterDist, vertices, geod) {
  var coords = [],
      angle = 360 / vertices;
  for (var i=0; i<vertices; i++) {
    coords.push(geod(p[0], p[1], i * angle, meterDist));
  }
  coords.push(coords[0].concat());
  return [coords]; // return vertices as the first (space-enclosing) ring of a Polygon geometry
}
