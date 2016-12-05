/* @requires mapshaper-common */

MapShaper.countPointsInLayer = function(lyr) {
  var count = 0;
  if (MapShaper.layerHasPoints(lyr)) {
    MapShaper.forEachPoint(lyr.shapes, function() {count++;});
  }
  return count;
};

MapShaper.getPointBounds = function(shapes) {
  var bounds = new Bounds();
  MapShaper.forEachPoint(shapes, function(p) {
    bounds.mergePoint(p[0], p[1]);
  });
  return bounds;
};

MapShaper.forEachPoint = function(shapes, cb) {
  shapes.forEach(function(shape, id) {
    var n = shape ? shape.length : 0;
    for (var i=0; i<n; i++) {
      cb(shape[i], id);
    }
  });
};

MapShaper.transformPointsInLayer = function(lyr, f) {
  if (MapShaper.layerHasPoints(lyr)) {
    MapShaper.forEachPoint(lyr.shapes, function(p) {
      var p2 = f(p[0], p[1]);
      p[0] = p2[0];
      p[1] = p2[1];
    });
  }
};
