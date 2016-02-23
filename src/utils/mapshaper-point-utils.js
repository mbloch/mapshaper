/* @requires mapshaper-common */

MapShaper.countPointsInLayer = function(lyr) {
  var count = 0;
  if (MapShaper.layerHasPoints(lyr)) {
    MapShaper.forEachPoint(lyr, function() {count++;});
  }
  return count;
};

MapShaper.forEachPoint = function(lyr, cb) {
  if (lyr.geometry_type != 'point') {
    error("[forEachPoint()] Expects a point layer");
  }
  lyr.shapes.forEach(function(shape, id) {
    var n = shape ? shape.length : 0;
    for (var i=0; i<n; i++) {
      cb(shape[i], id);
    }
  });
};
