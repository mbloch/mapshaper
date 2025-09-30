import { isLatLngCRS, getDatasetCRS } from '../crs/mapshaper-projections';
import { error } from '../utils/mapshaper-logging';
import geom from '../geom/mapshaper-geom';
import require from '../mapshaper-require';
import { WGS84 } from './mapshaper-geom-constants';

var R = WGS84.SEMIMAJOR_AXIS;

// GeographicLib docs: https://geographiclib.sourceforge.io/html/js/
//   https://geographiclib.sourceforge.io/html/js/module-GeographicLib_Geodesic.Geodesic.html
//   https://geographiclib.sourceforge.io/html/js/tutorial-2-interface.html
function getGeodesic(P) {
  if (!isLatLngCRS(P)) error('Expected an unprojected CRS');
  var f = P.es / (1 + Math.sqrt(P.one_es));
  // var GeographicLib = require('mproj').internal.GeographicLib;
  var GeographicLib = require('geographiclib-geodesic');
  // return new GeographicLib.Geodesic.Geodesic(P.a, 0)
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

function wrap(deg) {
  while (deg < -180) deg += 360;
  while (deg > 180) deg -= 360;
  return deg;
}

function fastGeodeticBearingFunction(lng1, lat1, lng2, lat2) {
  var D2R = Math.PI / 180;
  var f = 1 / 298.257223563;
  var e2 = f * (2 - f);
  var m = R * D2R;
  var coslat = Math.cos(lat1 * D2R);
  var w2 = 1 / (1 - e2 * (1 - coslat * coslat));
  var w = Math.sqrt(w2);
  var kx = m * w * coslat;
  var ky = m * w * w2 * (1 - e2);
  var dx = wrap(lng2 - lng1) * kx;
  var dy = (lat2 - lat1) * ky;
  return Math.atan2(dx, dy) / D2R;
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

// return function to calculate bearing of a segment in degrees
export function getBearingFunction(dataset) {
  var P = getDatasetCRS(dataset);
  // var g = getGeodesic(P);
  // if (isLatLngCRS) {
  //   return function(lng1, lat1, lng2, lat2) {
  //     var tmp = g.Inverse(lat1, lng1, lat2, lng2);
  //     return tmp.azi1;
  //     // return bearingDegrees(lng1, lat1, lng2, lat2);
  //   };
  // }
  // return isLatLngCRS(P) ? bearingDegrees : bearingDegrees2D;
  return isLatLngCRS(P) ? fastGeodeticBearingFunction : bearingDegrees2D;
}

// get bearing in degrees from point ab to point cd
export function bearingDegrees(a, b, c, d) {
  return geom.bearing(a, b, c, d) * 180 / Math.PI;
}

export function bearingDegrees2D(a, b, c, d) {
  return geom.bearing2D(a, b, c, d) * 180 / Math.PI;
}

