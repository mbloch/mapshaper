/* @requires mapshaper-projections */

internal.getGeodesic = function(dataset) {
  var P = internal.getDatasetCRS(dataset);
  if (!internal.isLatLngCRS(P)) error('Expected an unprojected CRS');
  var f = P.es / (1 + Math.sqrt(P.one_es));
  var GeographicLib = require('mproj').internal.GeographicLib;
  return new GeographicLib.Geodesic.Geodesic(P.a, f);
};

internal.getPlanarSegmentEndpoint = function(x, y, bearing, meterDist) {
  var rad = bearing / 180 * Math.PI;
  var dx = Math.sin(rad) * meterDist;
  var dy = Math.cos(rad) * meterDist;
  return [x + dx, y + dy];
};

// source: https://github.com/mapbox/cheap-ruler/blob/master/index.js
internal.fastGeodeticSegmentFunction = function(lng, lat, bearing, meterDist) {
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
};

internal.getGeodeticSegmentFunction = function(dataset, highPrecision) {
  var P = internal.getDatasetCRS(dataset);
  if (!internal.isLatLngCRS(P)) {
    return internal.getPlanarSegmentEndpoint;
  }
  if (!highPrecision) {
    // CAREFUL: this function has higher error at very large distances and at the poles
    // also, it wouldn't work for other planets than Earth
    return internal.fastGeodeticSegmentFunction;
  }
  var g = internal.getGeodesic(dataset);
  return function(lng, lat, bearing, meterDist) {
    var o = g.Direct(lat, lng, bearing, meterDist);
    var p = [o.lon2, o.lat2];
    return p;
  };
};

// return function to calculate bearing of a segment in degrees
internal.getBearingFunction = function(dataset) {
  var P = internal.getDatasetCRS(dataset);
  var f = internal.isLatLngCRS(P) ? geom.bearing : geom.bearing2D;
  return function(a, b, c, d) {
    return f(a, b, c, d) * 180 / Math.PI;
  };
};
