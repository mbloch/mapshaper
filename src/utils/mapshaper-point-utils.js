/* @requires mapshaper-common */

internal.countPointsInLayer = function(lyr) {
  var count = 0;
  if (internal.layerHasPoints(lyr)) {
    internal.forEachPoint(lyr.shapes, function() {count++;});
  }
  return count;
};

internal.countPoints2 = function(shapes, test) {
  var count = 0;
  var i, n, j, m, shp;
  for (i=0, n=shapes.length; i<n; i++) {
    shp = shapes[i];
    for (j=0, m=shp ? shp.length : 0; j<m; j++) {
      if (!test || test(shp[j])) {
        count++;
      }
    }
  }
  return count;
};

internal.getPointBounds = function(shapes) {
  var bounds = new Bounds();
  internal.forEachPoint(shapes, function(p) {
    bounds.mergePoint(p[0], p[1]);
  });
  return bounds;
};

internal.forEachPoint = function(shapes, cb) {
  shapes.forEach(function(shape, id) {
    var n = shape ? shape.length : 0;
    for (var i=0; i<n; i++) {
      cb(shape[i], id);
    }
  });
};

internal.transformPointsInLayer = function(lyr, f) {
  if (internal.layerHasPoints(lyr)) {
    internal.forEachPoint(lyr.shapes, function(p) {
      var p2 = f(p[0], p[1]);
      p[0] = p2[0];
      p[1] = p2[1];
    });
  }
};
