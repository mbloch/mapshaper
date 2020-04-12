import { isLatLngCRS, getDatasetCRS } from '../geom/mapshaper-projections';
import { error } from '../utils/mapshaper-logging';
import geom from '../geom/mapshaper-geom';

function getGeodesic(dataset) {
  var P = getDatasetCRS(dataset);
  if (!isLatLngCRS(P)) error('Expected an unprojected CRS');
  var f = P.es / (1 + Math.sqrt(P.one_es));
  var GeographicLib = require('mproj').internal.GeographicLib;
  return new GeographicLib.Geodesic.Geodesic(P.a, f);
}

function getPlanarSegmentEndpoint(x, y, bearing, meterDist) {
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

export function getGeodeticSegmentFunction(dataset, highPrecision) {
  var P = getDatasetCRS(dataset);
  if (!isLatLngCRS(P)) {
    return getPlanarSegmentEndpoint;
  }
  if (!highPrecision) {
    // CAREFUL: this function has higher error at very large distances and at the poles
    // also, it wouldn't work for other planets than Earth
    return fastGeodeticSegmentFunction;
  }
  var g = getGeodesic(dataset);
  return function(lng, lat, bearing, meterDist) {
    var o = g.Direct(lat, lng, bearing, meterDist);
    var p = [o.lon2, o.lat2];
    return p;
  };
}

function getGeodeticDistanceFunction(dataset, highPrecision) {
  var P = getDatasetCRS(dataset);
  if (!isLatLngCRS(P)) {
    return getPlanarSegmentEndpoint;
  }
}

// Useful for determining if a segment that intersects another segment is
// entering or leaving an enclosed buffer area
// returns -1 if angle of p1p2 -> p3p4 is counter-clockwise (left turn)
// returns 1 if angle is clockwise
// return 0 if segments are collinear
export function segmentTurn(p1, p2, p3, p4) {
  var ax = p1[0],
      ay = p1[1],
      bx = p2[0],
      by = p2[1],
      // shift p3p4 segment to start at p2
      dx = bx - p3[0],
      dy = by - p3[1],
      cx = p4[0] + dx,
      cy = p4[1] + dy,
      orientation = geom.orient2D(ax, ay, bx, by, cx, cy);
    if (!orientation) return 0;
    return orientation < 0 ? 1 : -1;
}

function bearingDegrees(a, b, c, d) {
  return geom.bearing(a, b, c, d) * 180 / Math.PI;
}

function bearingDegrees2D(a, b, c, d) {
  return geom.bearing2D(a, b, c, d) * 180 / Math.PI;
}

// return function to calculate bearing of a segment in degrees
export function getBearingFunction(dataset) {
  var P = getDatasetCRS(dataset);
  return isLatLngCRS(P) ? bearingDegrees : bearingDegrees2D;
}
