/* @requires mapshaper-common */

MapShaper.countPointsInLayer = function(lyr) {
  var count = 0;
  if (MapShaper.layerHasPoints(lyr)) {
    MapShaper.forEachPoint(lyr.shapes, function() {count++;});
  }
  return count;
};

MapShaper.forEachPoint = function(shapes, cb) {
  shapes.forEach(function(shape, id) {
    var n = shape ? shape.length : 0;
    for (var i=0; i<n; i++) {
      cb(shape[i], id);
    }
  });
};
