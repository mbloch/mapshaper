/* @requires mapshaper-projections */


internal.getGeodesic = function(dataset) {
  var P = internal.getDatasetCRS(dataset);
  if (!internal.isLatLngCRS(P)) error('Expected an unprojected CRS');
  var f = P.es / (1 + Math.sqrt(P.one_es));
  var GeographicLib = require('mproj').internal.GeographicLib;
  return new GeographicLib.Geodesic.Geodesic(P.a, f);
};
