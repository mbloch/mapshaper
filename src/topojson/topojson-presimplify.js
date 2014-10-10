/* @requires topojson-common, mapshaper-common, mapshaper-geom */


TopoJSON.getPresimplifyFunction = function(arcs, displayWidth) {
  var isLatLng = MapShaper.probablyDecimalDegreeBounds(arcs.getBounds());
  var width = arcs.getBounds().width();
  if (isLatLng) {
    // Convert degrees to meters
    // TODO: fix
    width *= 6378137 * Math.PI / 180;
  }
  return TopoJSON.getZScaler(width, displayWidth);
};

TopoJSON.getZScaler = function(sourceWidth, displayWidth) {
  var k = sourceWidth / displayWidth,
      round = Math.round; // geom.getRoundingFunction(0.1);
  return function(z) {
    var thresh = k / z;
    if (thresh < 1 || z === 0) {
      thresh = 1;
    } else {
      thresh = round(thresh);
    }
    return thresh;
  };
};
