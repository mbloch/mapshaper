/* @requires mapshaper-point-utils, mapshaper-geom */

// TODO: use an actual index instead of linear search
function PointIndex(shapes, opts) {
  var buf = utils.isNonNegNumber(opts.buffer) ? opts.buffer : 1e-3;
  var minDistSq, minId, target;
  this.findNearestPointFeature = function(shape) {
    minDistSq = Infinity;
    minId = -1;
    target = shape || [];
    internal.forEachPoint(shapes, testPoint);
    return minId;
  };

  function testPoint(p, id) {
    var distSq;
    for (var i=0; i<target.length; i++) {
      distSq = distanceSq(target[i][0], target[i][1], p[0], p[1]);
      if (distSq < minDistSq && distSq <= buf * buf) {
        minDistSq = distSq;
        minId = id;
      }
    }
  }
}
