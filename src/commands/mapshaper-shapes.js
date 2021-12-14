import { stop } from '../utils/mapshaper-logging';
import cmd from '../mapshaper-cmd';
import { getDatasetCRS, getCRS, requireProjectedDataset } from '../crs/mapshaper-projections';
import { requirePointLayer } from '../dataset/mapshaper-layer-utils';
import { importGeoJSON } from '../geojson/geojson-import';
import { getPointBufferPolygon, getPointBufferCoordinates } from '../buffer/mapshaper-point-buffer';
import { getBufferDistanceFunction } from '../buffer/mapshaper-buffer-common';
import { mergeOutputLayerIntoDataset } from '../dataset/mapshaper-dataset-utils';
import { getGeodeticSegmentFunction } from '../geom/mapshaper-geodesic';
import { getAffineTransform } from '../commands/mapshaper-affine';

cmd.shapes = function(lyr, dataset, opts) {
  requireProjectedDataset(dataset);
  requirePointLayer(lyr);
  var type = opts.type || 'polygon';
  var sides = opts.sides || getDefaultSides(type);
  var rotation = +opts.rotation || 0;
  var distanceFn = getBufferDistanceFunction(lyr, dataset, opts);
  var crs = getDatasetCRS(dataset);
  var geod = getGeodeticSegmentFunction(crs);
  var geometries = lyr.shapes.map(function(shape, i) {
    var dist = distanceFn(i);
    if (!dist || !shape) return null;
    return getMultiPolygon(shape, geod, dist, sides, rotation, opts);
  });
  var geojson = {
    type: 'GeometryCollection',
    geometries: geometries
  };
  var dataset2 = importGeoJSON(geojson);
  var lyr2 = mergeOutputLayerIntoDataset(lyr, dataset, dataset2, opts);
  return [lyr2];
};

function getDefaultSides(type) {
  return {
    star: 10,
    circle: 72,
    triangle: 3,
    square: 4,
    pentagon: 5,
    hexagon: 6,
    heptagon: 7,
    octagon: 8,
    nonagon: 9,
    decagon: 10
  }[type] || 4;
}

function getMultiPolygon(shape, geod, dist, sides, rotation, opts) {
  var geom = {
    type: 'MultiPolygon',
    coordinates: []
  };
  var coords;
  for (var i=0; i<shape.length; i++) {
    coords = makePolygon(geod, shape[i], dist, sides, opts);
    rotateCoords(coords, rotation, shape[i]);
    geom.coordinates[i] = [coords];
  }
  return geom;
}

// sides: e.g. 5-pointed star has 10 sides
// radius: distance from center to point
//
function makePolygon(geod, center, radius, sides, opts) {
  var isStar = opts.type == 'star';
  if (isStar && (sides < 6 || sides % 2 !== 0)) {
    stop(`Invalid number of sides for a star (${sides})`);
  } else if (sides >= 3 === false) {
    stop(`Invalid number of sides (${sides})`);
  }
  var coords = [],
      angle = 360 / sides,
      b = isStar ? 1 : 0.5,
      theta, even, len;
  if (opts.orientation == 'b') {
    b = 0;
  }
  for (var i=0; i<sides; i++) {
    // offsetting by half a step so 4 sides are flat, not pointy
    // (looks better on low-vertex circles)
    even = i % 2 == 0;
    len = radius;
    if (isStar && even) {
      len *= (opts.star_ratio || 0.5);
    }
    theta = (i + b) * angle % 360;
    coords.push(geod(center[0], center[1], theta, len));
  }
  coords.push(coords[0].concat());
  return coords;
}


function rotateCoords(coords, rotation, center) {
  // TODO: consider avoiding re-instantiating function on every call
  if (!rotation) return;
  var f = getAffineTransform(rotation || 0, 1, [0, 0], center);
  coords.forEach(function(p) {
    var p2 = f(p[0], p[1]);
    p[0] = p2[0];
    p[1] = p2[1];
  });
}
