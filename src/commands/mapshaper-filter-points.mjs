import { message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';
import { requireSinglePointLayer } from '../dataset/mapshaper-layer-utils';
import { isLatLngDataset, getDatasetCRS, isLatLngCRS } from '../crs/mapshaper-projections';
import { stop } from '../utils/mapshaper-logging';
import { filterLayerInPlace } from '../commands/mapshaper-filter';
import { getPointsInLayer } from '../points/mapshaper-point-utils';
import { getAlphaDistanceFilter } from '../commands/mapshaper-alpha-shapes';
import Delaunator from 'delaunator';


// Removes points that are far from other points
cmd.filterPoints = function(lyr, dataset, opts) {
  requireSinglePointLayer(lyr);
  if (opts.group_interval > 0 === false) {
    stop('Expected a positive group_interval parameter');
  }

  // TODO: remove duplication with mapshaper-alpha-shapes.js
  var alphaFilter = getAlphaDistanceFilter(dataset, opts.group_interval);
  var points = getPointsInLayer(lyr);
  var del = Delaunator.from(points);
  var triangles = del.triangles;
  var index = new Uint8Array(points.length);
  var a, b, c, ai, bi, ci;
  for (var i=0, n=triangles.length; i<n; i+=3) {
    // a, b, c: triangle vertices in CCW order
    ai = triangles[i];
    bi = triangles[i+1];
    ci = triangles[i+2];
    a = points[ai];
    b = points[bi];
    c = points[ci];
    if (alphaFilter(a, b) && alphaFilter(b, c) && alphaFilter(a, c)) {
      index[ai] = 1;
      index[bi] = 1;
      index[ci] = 1;
    }
  }
  filterLayerInPlace(lyr, function(shpId) {
    return index[shpId] == 1;
  });
};
