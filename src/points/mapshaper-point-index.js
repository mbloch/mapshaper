import geom from '../geom/mapshaper-geom';
import utils from '../utils/mapshaper-utils';
import { forEachPoint } from '../points/mapshaper-point-utils';

// TODO: use an actual index instead of linear search
export function PointIndex(shapes, opts) {
  var buf = utils.isNonNegNumber(opts.buffer) ? opts.buffer : 1e-3;
  var minDistSq, minId, target;
  this.findNearestPointFeature = function(shape) {
    minDistSq = Infinity;
    minId = -1;
    target = shape || [];
    forEachPoint(shapes, testPoint);
    return minId;
  };

  function testPoint(p, id) {
    var distSq;
    for (var i=0; i<target.length; i++) {
      distSq = geom.distanceSq(target[i][0], target[i][1], p[0], p[1]);
      if (distSq < minDistSq && distSq <= buf * buf) {
        minDistSq = distSq;
        minId = id;
      }
    }
  }
}
