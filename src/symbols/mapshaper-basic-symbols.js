import { getPlanarSegmentEndpoint } from '../geom/mapshaper-geodesic';
import { stop } from '../utils/mapshaper-logging';

// sides: e.g. 5-pointed star has 10 sides
// radius: distance from center to point
//
export function getPolygonCoords(d) {
  var radius = d.radius || d.length || d.r;
  if (radius > 0 === false) return null;
  var type = d.type;
  var sides = +d.sides || getDefaultSides(type);
  var isStar = type == 'star';
  if (isStar && (sides < 6 || sides % 2 !== 0)) {
    stop(`Invalid number of sides for a star (${sides})`);
  } else if (sides >= 3 === false) {
    stop(`Invalid number of sides (${sides})`);
  }
  var coords = [],
      angle = 360 / sides,
      b = isStar ? 1 : 0.5,
      theta, even, len;
  if (d.orientation == 'b' || d.flipped || d.rotated) {
    b = 0;
  }
  for (var i=0; i<sides; i++) {
    even = i % 2 == 0;
    len = radius;
    if (isStar && even) {
      len *= (d.star_ratio || 0.5);
    }
    theta = (i + b) * angle % 360;
    coords.push(getPlanarSegmentEndpoint(0, 0, theta, len));
  }
  coords.push(coords[0].concat());
  return [coords];
}

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
