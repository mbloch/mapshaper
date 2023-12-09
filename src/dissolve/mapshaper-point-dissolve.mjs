import { countMultiPartFeatures } from '../dataset/mapshaper-layer-utils';
import { compileFeatureExpression } from '../expressions/mapshaper-feature-expressions';
import { getLayerBounds } from '../dataset/mapshaper-layer-utils';
import { probablyDecimalDegreeBounds } from '../geom/mapshaper-latlon';
import geom from '../geom/mapshaper-geom';
import { stop } from '../utils/mapshaper-logging';

export function dissolvePointGeometry(lyr, getGroupId, opts) {
  var useSph = !opts.planar && probablyDecimalDegreeBounds(getLayerBounds(lyr));
  var getWeight = opts.weight ? compileFeatureExpression(opts.weight, lyr, null) : null;
  var groups = [];

  // TODO: support multipoints
  if (countMultiPartFeatures(lyr.shapes) !== 0) {
    stop("Dissolving multi-part points is not supported");
  }

  lyr.shapes.forEach(function(shp, i) {
    var groupId = getGroupId(i);
    var weight = getWeight ? getWeight(i) : 1;
    var p = shp && shp[0]; // Using first point (TODO: handle multi-point features)
    var tmp;
    if (!p) return;
    if (useSph) {
      tmp = [];
      geom.lngLatToXYZ(p[0], p[1], tmp);
      p = tmp;
    }
    groups[groupId] = reducePointCentroid(groups[groupId], p, weight);
  });

  return groups.map(function(memo) {
    var p1, p2;
    if (!memo) return null;
    if (useSph) {
      p1 = memo.centroid;
      p2 = [];
      geom.xyzToLngLat(p1[0], p1[1], p1[2], p2);
    } else {
      p2 = memo.centroid;
    }
    return memo ? [p2] : null;
  });
}

function reducePointCentroid(memo, p, weight) {
  var x = p[0],
      y = p[1],
      sum, k;

  if (x == x && y == y && weight > 0) {
    if (!memo) {
      memo = {sum: weight, centroid: p.concat()};
    } else {
      sum = memo.sum + weight;
      k = memo.sum / sum;
      memo.centroid[0] = k * memo.centroid[0] + weight * x / sum;
      memo.centroid[1] = k * memo.centroid[1] + weight * y / sum;
      if (p.length == 3) {
        memo.centroid[2] = k * memo.centroid[2] + weight * p[2] / sum;
      }
      memo.sum = sum;
    }
  }
  return memo;
}
