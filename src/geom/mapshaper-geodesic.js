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
internal.getFastGeodeticSegmentFunction = function(crs) {
  var R = crs.a; // consider using an average axis rather than semi-major
  var D2R = geom.D2R;
  return function(lng, lat, bearing, meterDist) {
    var lng1 = lng * D2R;
    var lat1 = lat * D2R;
    var distRad = meterDist / R;
    var bearingRad = bearing * D2R;
    var lat2 = lat1 + Math.cos(bearingRad) * distRad;
    var lng2 = lng1 + Math.sin(bearingRad) * distRad;
    return [lng2 / D2R, lat2 / D2R];
  };
};

internal.getGeodeticSegmentFunction = function(dataset, fast) {
  var P = internal.getDatasetCRS(dataset);
  if (!internal.isLatLngCRS(P)) {
    return internal.getPlanarSegmentEndpoint;
  }
  if (fast) {
    return internal.getFastGeodeticSegmentFunction(P);
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
