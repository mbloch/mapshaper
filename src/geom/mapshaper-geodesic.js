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

internal.getGeodeticSegmentFunction = function(dataset) {
  var P = internal.getDatasetCRS(dataset);
  if (!internal.isLatLngCRS(P)) {
    return internal.getPlanarSegmentEndpoint;
  }
  var g = internal.getGeodesic(dataset);
  return function(x, y, bearing, meterDist) {
    var o = g.Direct(y, x, bearing, meterDist);
    return [o.lon2, o.lat2];
  };
};
