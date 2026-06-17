import {
  getPlanarSegmentEndpoint,
  bearingDegrees2D
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

// Polar (clamp-to-extent) buffering bounds (see the 'polar' option). A polygon
// sliced for display at the antimeridian/poles has artificial seam edges at
// lng = +/-180 and lat = +/-90. The poles are unreachable in Mercator (y ->
// +/-Infinity), so clamp construction coordinates to a finite latitude just shy
// of the pole; output coords at the bound are snapped back to exactly +/-90.
var POLAR_HALF_WIDTH = WEBMERCATOR_WIDTH / 2;        // Mercator x at lng +/-180
var POLAR_LAT_LIMIT = 90 - 1e-3;                     // finite near-pole latitude
var POLAR_Y_LIMIT = R * Math.atanh(Math.sin(POLAR_LAT_LIMIT * D2R)); // Mercator y at the limit
var POLAR_LAT_SNAP = 90 - 2e-3;                      // snap |lat| >= this to 90
var POLAR_LNG_SNAP_EPS = 1e-6;                       // snap |lng| within this of 180 to exactly 180

// arr: array of MultiPolygon and/or Point Features
// opts.polar: snap near-boundary coords to exactly +/-180 / +/-90
export function unprojectFeatures(arr, opts) {
  var polar = !!(opts && opts.polar);
  arr.forEach(function(feat) {
    var coords = feat.geometry.coordinates;
    var type = feat.geometry.type;
    if (type == 'Point') {
      unprojectPointCoords(coords, polar);
    } else if (type == 'MultiPolygon') {
      coords.forEach(function(c) { unprojectPolygonCoords(c, polar); });
    } else {
      error('Unexpected geometry type:', type);
    }
  });
}

function unprojectPolygonCoords(coords, polar) {
  forEachPoint(coords, function(p) {
    unprojectPointCoords(p, polar);
  });
}

function unprojectPointCoords(p, polar) {
  var p2 = fromWebMercator(p[0], p[1]);
  if (polar) {
    // The buffer is allowed to expand past the antimeridian during construction
    // (walls run out to lng > 180 / < -180); it is clipped to the world
    // rectangle afterwards, so DON'T fold the overshoot here -- folding would
    // collapse it onto a spurious vertical edge at +/-180 instead of cutting it.
    // Pin pole latitudes (Mercator can't represent the pole, so offsets are
    // capped just shy of it) and snap values within rounding of +/-90 / +/-180
    // to the exact bound for clean clip edges.
    if (p2[1] >= POLAR_LAT_SNAP) p2[1] = 90;
    else if (p2[1] <= -POLAR_LAT_SNAP) p2[1] = -90;
    if (Math.abs(p2[0] - 180) < POLAR_LNG_SNAP_EPS) p2[0] = 180;
    else if (Math.abs(p2[0] + 180) < POLAR_LNG_SNAP_EPS) p2[0] = -180;
  }
  p[0] = p2[0];
  p[1] = p2[1];
}

// Wrap a shape iterator to convert lng,lat coords to spherical Mercator coords.
// opts.polar: clamp an input latitude that sits exactly at a pole to a finite
// near-pole value so construction is well-defined (Mercator y is infinite at the
// pole). The antimeridian is left alone here (see getProjectingPathIterator body).
export function getProjectingPathIterator(arcs, opts) {
  var iter = new ShapeIter(arcs);
  var polar = !!(opts && opts.polar);
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
        if (polar) {
          // Pin a seam latitude that sits exactly at a pole (lat +/-90 -> y is
          // infinite in Mercator) to a finite near-pole value so construction is
          // well-defined; the result is snapped back to +/-90 on output. The
          // antimeridian walls are left unclamped here (clamping x mid-path
          // breaks the unwrap continuity and tangles corner joins).
          if (p[1] > POLAR_Y_LIMIT) p[1] = POLAR_Y_LIMIT;
          else if (p[1] < -POLAR_Y_LIMIT) p[1] = -POLAR_Y_LIMIT;
        }
        iter2.x = prevX === null ? p[0] : unwrapX(p[0], prevX);
        iter2.y = p[1];
        prevX = iter2.x;
      }
      return val;
    }
  };
  return iter2;
}

// Stop a great-circle offset from crossing a pole (see the 'polar' option). When
// the offset would cross a pole it reappears at the opposite longitude (Mercator
// x jumps by ~half the world width) at a latitude back inside the valid range;
// detect that jump and pin the offset to the pole at the source longitude
// instead, so the floor edge of a pole-sliced polygon stays near the pole rather
// than folding to the far meridian. Latitudes are capped so a near-pole offset
// cannot exceed the finite construction bound.
function clampPolar(base) {
  return function(x, y, bearing, dist) {
    var p = base(x, y, bearing, dist);
    if (Math.abs(p[0] - x) > POLAR_HALF_WIDTH * 0.5) {
      // great-circle offset crossed a pole (reappears at the opposite longitude,
      // i.e. Mercator x jumps by ~half the world width); pin it to the pole at the
      // source longitude instead of folding across to the far meridian.
      p[0] = x;
      p[1] = p[1] < 0 ? -POLAR_Y_LIMIT : POLAR_Y_LIMIT;
    }
    if (p[1] < -POLAR_Y_LIMIT) p[1] = -POLAR_Y_LIMIT;
    else if (p[1] > POLAR_Y_LIMIT) p[1] = POLAR_Y_LIMIT;
    return p;
  };
}

export function getOffsetFunction(crs, opts) {
  if (!isLatLngCRS(crs)) {
    return getPlanarSegmentEndpoint;
  }
  // Offset each point by a true geodesic distance, working directly in spherical
  // Mercator coordinates (the rest of the buffer construction is planar Mercator),
  // so we avoid the round-trip through lon/lat that the lat/long destination
  // formulas would require. This relies on the Gudermannian / isometric-latitude
  // identities, exact for web Mercator (y = R*psi, u = y/R):
  //   sin(phi) = tanh(u),  cos(phi) = sech(u) = 1/cosh(u),
  //   psi = atanh(sin phi)  =>  y = R*atanh(sin phi).
  //
  // The default great-circle walk lands at the true geodesic distance in the true
  // geodesic direction, so it corrects the radius and makes round caps/joins true
  // geodesic circles. The opts.rhumb walk holds a constant bearing (a straight
  // line in Mercator), so the endpoint falls short of the great-circle distance
  // and drifts in direction as the radius grows -- large buffers come out
  // distorted (egg-shaped caps/joins) -- but it is occasionally useful.
  var offset = opts && opts.rhumb ? rhumbOffset : greatCircleOffset;
  return opts && opts.polar ? clampPolar(offset) : offset;
}

// Great-circle (spherical geodesic) offset, computed directly in Mercator coords.
// bearing: compass degrees; meterDist: meters; x, y and the result: Mercator.
function greatCircleOffset(x, y, bearing, meterDist) {
  var theta = bearing * D2R;
  var u = y / R;
  var delta = meterDist / R; // angular distance traveled
  var sinPhi1 = Math.tanh(u);
  var cosPhi1 = 1 / Math.cosh(u);
  var sinDelta = Math.sin(delta);
  var cosDelta = Math.cos(delta);
  var sinPhi2 = sinPhi1 * cosDelta + cosPhi1 * sinDelta * Math.cos(theta);
  if (sinPhi2 > 1) sinPhi2 = 1;
  else if (sinPhi2 < -1) sinPhi2 = -1;
  var dLambda = Math.atan2(Math.sin(theta) * sinDelta * cosPhi1,
    cosDelta - sinPhi1 * sinPhi2);
  return [unwrapX(x + R * dLambda, x), R * Math.atanh(sinPhi2)];
}

// Rhumb-line (constant-bearing loxodrome) offset, computed directly in Mercator
// coords. A loxodrome is a straight line in Mercator, so the east displacement is
// dx = tan(theta) * dy; only the north-south advance (a constant *angular* step
// in latitude, which Mercator stretches non-linearly) needs the Gudermannian.
function rhumbOffset(x, y, bearing, meterDist) {
  var theta = bearing * D2R;
  var u = y / R;
  var phi1 = 2 * Math.atan(Math.exp(u)) - Math.PI / 2; // gd(u)
  var dPhi = (meterDist / R) * Math.cos(theta);
  var phi2 = phi1 + dPhi;
  // clamp latitude to the poles rather than letting it wrap past them
  if (Math.abs(phi2) > Math.PI / 2) phi2 = phi2 > 0 ? Math.PI / 2 : -Math.PI / 2;
  var y2 = R * Math.atanh(Math.sin(phi2));
  // tan(theta) * dy is ill-conditioned for a due E-W line (dPhi -> 0, dy -> 0,
  // tan(theta) -> infinity); fall back to the local Mercator scale factor
  // sec(phi1) = cosh(u).
  var x2 = Math.abs(dPhi) > 1e-12 ?
    x + Math.tan(theta) * (y2 - y) :
    x + meterDist * Math.sin(theta) * Math.cosh(u);
  return [unwrapX(x2, x), y2];
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


