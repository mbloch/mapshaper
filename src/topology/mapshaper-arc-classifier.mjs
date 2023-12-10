import utils from '../utils/mapshaper-utils';
import { traversePaths } from '../paths/mapshaper-path-utils';
import { absArcId } from '../paths/mapshaper-arc-utils';
import { compileFeaturePairFilterExpression } from '../expressions/mapshaper-feature-expressions';

// Returns a function for constructing a query function that accepts an arc id and
// returns information about the polygon or polygons that use the given arc.
// TODO: explain this better.
//
// options:
//   filter: optional filter function; signature: function(idA, idB or -1) : boolean
//   reusable: flag that lets an arc be queried multiple times.
export function getArcClassifier(lyr, arcs, optsArg) {
  var opts = optsArg || {},
      useOnce = !opts.reusable,
      n = arcs.size(),
      a = new Int32Array(n),
      b = new Int32Array(n),
      filter;
  if (opts.where) {
    filter = compileFeaturePairFilterExpression(opts.where, lyr, arcs);
  }

  utils.initializeArray(a, -1);
  utils.initializeArray(b, -1);

  traversePaths(lyr.shapes, function(o) {
    var i = absArcId(o.arcId);
    var shpId = o.shapeId;
    var aval = a[i];
    if (aval == -1) {
      a[i] = shpId;
    } else if (shpId < aval) {
      b[i] = aval;
      a[i] = shpId;
    } else {
      b[i] = shpId;
    }
  });

  function classify(arcId, getKey) {
    var i = absArcId(arcId);
    var shpA = a[i];
    var shpB = b[i];
    var key;
    if (shpA == -1) return null;
    key = getKey(shpA, shpB);
    if (key === null || key === false) return null;
    if (useOnce) {
      // arc can only be queried once
      a[i] = -1;
      b[i] = -1;
    }
    // use optional filter to exclude some arcs
    if (filter && !filter(shpA, shpB)) return null;
    return key;
  }

  return function(getKey) {
    return function(arcId) {
      return classify(arcId, getKey);
    };
  };
}
