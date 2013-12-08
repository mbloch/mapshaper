/* @requires mapshaper-common */

MapShaper.calcLayerBounds = function(lyr, arcs) {
  var bounds = new Bounds();
  Utils.forEach(lyr.shapes, function(shp) {
    arcs.getMultiShapeBounds(shp, bounds);
  });
  return bounds;
};