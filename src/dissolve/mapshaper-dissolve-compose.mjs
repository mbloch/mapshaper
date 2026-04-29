// Builds a "dissolved" layer object from input shapes plus a grouping fn.
// Extracted from mapshaper-dissolve.mjs so that both -dissolve (the
// command) and polygon-dissolve2 (a helper used by -dissolve as well as
// other commands) can share the helper without forming an import cycle.

import { getFeatureCount } from '../dataset/mapshaper-layer-utils';
import { aggregateDataRecords } from '../dissolve/mapshaper-data-aggregation';
import utils from '../utils/mapshaper-utils';
import { message } from '../utils/mapshaper-logging';
import { DataTable } from '../datatable/mapshaper-data-table';

// @lyr: original undissolved layer
// @shapes: dissolved shapes
export function composeDissolveLayer(lyr, shapes, getGroupId, opts) {
  var records = null;
  var lyr2;
  if (lyr.data) {
    records = aggregateDataRecords(lyr.data.getRecords(), getGroupId, opts);
    // replace missing shapes with nulls
    for (var i=0, n=records.length; i<n; i++) {
      if (shapes && !shapes[i]) {
        shapes[i] = null;
      }
    }
  }
  lyr2 = {
    name: opts.no_replace ? null : lyr.name,
    shapes: shapes,
    data: records ? new DataTable(records) : null,
    geometry_type: lyr.geometry_type
  };
  if (!opts.silent) {
    printDissolveMessage(lyr, lyr2);
  }
  return lyr2;
}

function printDissolveMessage(pre, post) {
  var n1 = getFeatureCount(pre),
      n2 = getFeatureCount(post),
      msg = utils.format('Dissolved %,d feature%s into %,d feature%s',
        n1, utils.pluralSuffix(n1), n2,
        utils.pluralSuffix(n2));
  message(msg);
}
