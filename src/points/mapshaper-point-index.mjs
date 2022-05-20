import geom from '../geom/mapshaper-geom';
import utils from '../utils/mapshaper-utils';
import { getPointsInLayer } from '../points/mapshaper-point-utils';
import { requireSinglePointLayer } from '../dataset/mapshaper-layer-utils';
import { isLatLngCRS } from '../crs/mapshaper-projections';
import { convertDistanceParam } from '../geom/mapshaper-units';
import { IdTestIndex } from '../indexing/mapshaper-id-test-index';
import * as geokdbush from '../thirdparty/geokdbush';
import require from '../mapshaper-require';

export function PointIndex(srcLyr, crs, opts) {
  requireSinglePointLayer(srcLyr);
  var points = getPointsInLayer(srcLyr);
  var maxDist = opts.max_distance ? convertDistanceParam(opts.max_distance, crs) : 1e-3;
  var kdbush = require('kdbush');
  var index = new kdbush(points);
  var lookup = getLookupFunction(index, crs, maxDist);
  var uniqIndex = new IdTestIndex(points.length);

  this.lookupByMultiPoint = function(shape) {
    var hits = [], p, i, j, n;
    for (i=0, n=shape ? shape.length : 0; i<n; i++) {
      p = shape[i];
      hits = lookup(p);
      for (j=0; j<hits.length; j++) {
        uniqIndex.setId(hits[j]);
      }
    }
    hits = uniqIndex.getIds();
    uniqIndex.clear();
    return hits;
  };
}

function getLookupFunction(index, crs, meterDist) {
  var geodetic = crs ? isLatLngCRS(crs) : false;
  var toMeter = crs && crs.to_meter || 1;
  if (geodetic) {
    return function(p) {
      // kdbush uses km
      return geokdbush.around(index, p[0], p[1], Infinity, meterDist / 1000);
    };
  }
  return function(p) {
    return index.within(p[0], p[1], meterDist / toMeter);
  };
}
