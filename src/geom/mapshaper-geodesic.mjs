import { isLatLngCRS, getDatasetCRS } from '../crs/mapshaper-projections';
import { error } from '../utils/mapshaper-logging';
import geom from '../geom/mapshaper-geom';
import require from '../mapshaper-require';

// GeographicLib docs: https://geographiclib.sourceforge.io/html/js/
//   https://geographiclib.sourceforge.io/html/js/module-GeographicLib_Geodesic.Geodesic.html
//   https://geographiclib.sourceforge.io/html/js/tutorial-2-interface.html
function getGeodesic(P) {
  if (!isLatLngCRS(P)) error('Expected an unprojected CRS');
  var f = P.es / (1 + Math.sqrt(P.one_es));
  var GeographicLib = require('mproj').internal.GeographicLib;
  return new GeographicLib.Geodesic.Geodesic(P.a, f);
}

export function interpolatePoint2D(ax, ay, bx, by, k) {
  var j = 1 - k;
  return [ax * j + bx * k, ay * j + by * k];
}

export function getInterpolationFunction(P) {
  var spherical = P && isLatLngCRS(P);
  if (!spherical) return interpolatePoint2D;
  var geod = getGeodesic(P);
  return function(lng, lat, lng2, lat2, k) {
    var r = geod.Inverse(lat, lng, lat2, lng2);
    var dist = r.s12 * k;
    var r2 = geod.Direct(lat, lng, r.azi1, dist);
    return [r2.lon2, r2.lat2];
  };
}

export function getPlanarSegmentEndpoint(x, y, bearing, meterDist) {
  var rad = bearing / 180 * Math.PI;
  var dx = Math.sin(rad) * meterDist;
  var dy = Math.cos(rad) * meterDist;
  return [x + dx, y + dy];
}

// source: https://github.com/mapbox/cheap-ruler/blob/master/index.js
function fastGeodeticSegmentFunction(lng, lat, bearing, meterDist) {
  var D2R = Math.PI / 180;
  var cos = Math.cos(lat * D2R);
  var cos2 = 2 * cos * cos - 1;
  var cos3 = 2 * cos * cos2 - cos;
  var cos4 = 2 * cos * cos3 - cos2;
  var cos5 = 2 * cos * cos4 - cos3;
  var kx = (111.41513 * cos - 0.09455 * cos3 + 0.00012 * cos5) * 1000;
  var ky = (111.13209 - 0.56605 * cos2 + 0.0012 * cos4) * 1000;
  var bearingRad = bearing * D2R;
  var lat2 = lat + Math.cos(bearingRad) * meterDist / ky;
  var lng2 = lng + Math.sin(bearingRad) * meterDist / kx;
  return [lng2, lat2];
}

export function getGeodeticSegmentFunction(P) {
  if (!isLatLngCRS(P)) {
    return getPlanarSegmentEndpoint;
  }
  var g = getGeodesic(P);
  return function(lng, lat, bearing, meterDist) {
    var o = g.Direct(lat, lng, bearing, meterDist);
    var p = [o.lon2, o.lat2];
    return p;
  };
}

export function getFastGeodeticSegmentFunction(P) {
  // CAREFUL: this function has higher error at very large distances and at the poles
  // also, it wouldn't work for other planets than Earth
  return isLatLngCRS(P) ? fastGeodeticSegmentFunction : getPlanarSegmentEndpoint;
}


export function bearingDegrees(a, b, c, d) {
  return geom.bearing(a, b, c, d) * 180 / Math.PI;
}

export function bearingDegrees2D(a, b, c, d) {
  return geom.bearing2D(a, b, c, d) * 180 / Math.PI;
}

// return function to calculate bearing of a segment in degrees
export function getBearingFunction(dataset) {
  var P = getDatasetCRS(dataset);
  return isLatLngCRS(P) ? bearingDegrees : bearingDegrees2D;
}
