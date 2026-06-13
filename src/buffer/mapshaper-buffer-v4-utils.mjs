import {
  getPlanarSegmentEndpoint,
  bearingDegrees2D,
  wrap
} from '../geom/mapshaper-geodesic';
import { isLatLngCRS } from '../crs/mapshaper-projections';
import { ShapeIter } from '../paths/mapshaper-shape-iter';
import { forEachPoint } from '../points/mapshaper-point-utils';
import { WGS84 } from '../geom/mapshaper-geom-constants';
import { error } from '../utils/mapshaper-logging';

var R = WGS84.SEMIMAJOR_AXIS;
var D2R = Math.PI / 180;
var R2D = 180 / Math.PI;
var WEBMERCATOR_WIDTH = R * Math.PI * 2;

// arr: array of MultiPolygon and/or Point Features
export function unprojectFeatures(arr) {
  arr.forEach(function(feat) {
    var coords = feat.geometry.coordinates;
    var type = feat.geometry.type;
    if (type == 'Point') {
      unprojectPointCoords(coords);
    } else if (type == 'MultiPolygon') {
      coords.forEach(unprojectPolygonCoords);
    } else {
      error('Unexpected geometry type:', type);
    }
  });
}

function unprojectPolygonCoords(coords) {
  forEachPoint(coords, function(p) {
    unprojectPointCoords(p);
  });
}

function unprojectPointCoords(p) {
  var p2 = fromWebMercator(p[0], p[1]);
  p[0] = p2[0];
  p[1] = p2[1];
}

// Wrap a shape iterator to convert lng,lat coords to spherical Mercator coords
export function getProjectingPathIterator(arcs) {
  var iter = new ShapeIter(arcs);
  var prevX;
  var iter2 = {
    x: 0,
    y: 0,
    init: (path) => {
      iter.init(path);
      prevX = null;
    },
    hasNext: () => {
      var val = iter.hasNext();
      var p;
      if (val) {
        p = toWebMercator(iter.x, iter.y);
        iter2.x = prevX === null ? p[0] : unwrapX(p[0], prevX);
        iter2.y = p[1];
        prevX = iter2.x;
      }
      return val;
    }
  };
  return iter2;
}

export function getOffsetFunction(crs, opts) {
  if (!isLatLngCRS(crs)) {
    return getPlanarSegmentEndpoint;
  }
  // Offset each point along a great circle (spherical geodesic) by default, or
  // along a rhumb line if opts.rhumb is set. The rhumb offset holds a constant
  // bearing, so the endpoint falls short of the target great-circle distance and
  // drifts in direction as the radius grows -- large buffers come out distorted
  // (egg-shaped caps/joins). The great-circle "direct" walk lands at the true
  // geodesic distance in the true geodesic direction, so it corrects the radius
  // and makes round caps/joins true geodesic circles, while the rest of the
  // buffer construction stays in planar Mercator coords.
  // TODO: rewrite to use Mercator coords directly
  var destFn = opts && opts.rhumb ? getRhumbLineDestination : getGreatCircleDestination;
  return function(x, y, bearing, meterDist) {
    var p = fromWebMercator(x, y);
    var p2 = destFn(p[0], p[1], bearing, meterDist);
    var p3 = toWebMercator(p2[0], p2[1]);
    p3[0] = unwrapX(p3[0], x);
    return p3;
  };
}

export function getBearingFunction(crs) {
  return isLatLngCRS(crs) ? getRhumbLineBearing : bearingDegrees2D;
}

export function toWebMercator(lng, lat) {
  var k = Math.cos(lat * D2R);
  var x = R * lng * D2R;
  var y = R * Math.log(Math.tan(Math.PI * 0.25 + lat * D2R * 0.5));
  return [x, y];
}

export function fromWebMercator(x, y) {
  var lon = x / R * R2D;
  var lat = R2D * (Math.PI * 0.5 - 2 * Math.atan(Math.exp(-y / R)));
  return [lon, lat];
}

function unwrapX(x, refX) {
  while (x - refX > WEBMERCATOR_WIDTH / 2) x -= WEBMERCATOR_WIDTH;
  while (x - refX < -WEBMERCATOR_WIDTH / 2) x += WEBMERCATOR_WIDTH;
  return x;
}

// Calculates the constant bearing (rhumb line / loxodrome) from one lat/long
// coordinate to another.
// Returns a compass bearing in degrees (0-360). Reference:
//   https://www.movable-type.co.uk/scripts/latlong.html#rhumb-bearing
function getRhumbLineBearing(lng1, lat1, lng2, lat2) {
  var phi1 = lat1 * D2R;
  var phi2 = lat2 * D2R;
  var dLambda = (lng2 - lng1) * D2R;
  // if heading crosses the antimeridian, take the shorter route
  if (Math.abs(dLambda) > Math.PI) {
    dLambda = dLambda > 0 ? dLambda - 2 * Math.PI : dLambda + 2 * Math.PI;
  }
  // dPsi is the difference in "stretched" (Mercator) latitudes
  var dPsi = Math.log(Math.tan(phi2 / 2 + Math.PI / 4) / Math.tan(phi1 / 2 + Math.PI / 4));
  var theta = Math.atan2(dLambda, dPsi);
  return (theta / D2R + 360) % 360;
}

// Calculates the destination point traveling a given distance along a rhumb line
// from a starting lat/long coordinate with a constant bearing.
// Returns [lng, lat] in degrees. Reference:
//   https://www.movable-type.co.uk/scripts/latlong.html#rhumb-destination
export function getRhumbLineDestination(lng, lat, bearing, meterDist) {
  var d = meterDist / R; // angular distance traveled
  var phi1 = lat * D2R;
  var lambda1 = lng * D2R;
  var theta = bearing * D2R;
  var dPhi = d * Math.cos(theta);
  var phi2 = phi1 + dPhi;
  // clamp latitude to the poles rather than letting it wrap past them
  if (Math.abs(phi2) > Math.PI / 2) {
    phi2 = phi2 > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  // dPsi is the difference in "stretched" (Mercator) latitudes
  var dPsi = Math.log(Math.tan(phi2 / 2 + Math.PI / 4) / Math.tan(phi1 / 2 + Math.PI / 4));
  // q is ill-conditioned for an E-W line (dPsi -> 0), so fall back to cos(phi1)
  var q = Math.abs(dPsi) > 1e-12 ? dPhi / dPsi : Math.cos(phi1);
  var dLambda = d * Math.sin(theta) / q;
  var lambda2 = lambda1 + dLambda;
  return [wrap(lambda2 / D2R), phi2 / D2R];
}

// Destination point a given great-circle (spherical geodesic) distance from a
// start point along an initial compass bearing. Closed-form, no iteration.
// Unlike the rhumb-line version, the endpoint is at great-circle distance
// @meterDist from the start (not loxodrome distance), so it does not fall short
// or drift in direction at large distances. Reference:
//   https://www.movable-type.co.uk/scripts/latlong.html#dest-point
export function getGreatCircleDestination(lng, lat, bearing, meterDist) {
  var delta = meterDist / R; // angular distance traveled
  var theta = bearing * D2R;
  var phi1 = lat * D2R;
  var lambda1 = lng * D2R;
  var sinPhi1 = Math.sin(phi1);
  var cosPhi1 = Math.cos(phi1);
  var sinDelta = Math.sin(delta);
  var cosDelta = Math.cos(delta);
  var sinPhi2 = sinPhi1 * cosDelta + cosPhi1 * sinDelta * Math.cos(theta);
  if (sinPhi2 > 1) sinPhi2 = 1;
  else if (sinPhi2 < -1) sinPhi2 = -1;
  var phi2 = Math.asin(sinPhi2);
  var lambda2 = lambda1 + Math.atan2(
    Math.sin(theta) * sinDelta * cosPhi1,
    cosDelta - sinPhi1 * sinPhi2);
  return [wrap(lambda2 / D2R), phi2 / D2R];
}

