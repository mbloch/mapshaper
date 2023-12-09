import { compileFeatureExpression } from '../expressions/mapshaper-feature-expressions';
import { getFeatureCount } from '../dataset/mapshaper-layer-utils';
import { message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';
import { DataTable } from '../datatable/mapshaper-data-table';

cmd.uniq = function(lyr, arcs, opts) {
  var n = getFeatureCount(lyr),
      compiled = compileFeatureExpression(opts.expression, lyr, arcs),
      maxCount = opts.max_count || 1,
      counts = {},
      keepFlags = [],
      verbose = !!opts.verbose,
      invert = !!opts.invert,
      index = !!opts.index,
      records = lyr.data ? lyr.data.getRecords() : null,
      filter = function(d, i) {return keepFlags[i];};


  utils.repeat(n, function(i) {
    var val = compiled(i);
    var count = val in counts ? counts[val] + 1 : 1;
    var keep = count <= maxCount;
    var rec;
    if (index) {
      keep = true;
      rec = records && records[i];
      if (rec) rec.index = count;
    } else if (invert) {
      keep = !keep;
    }
    keepFlags[i] = keep;
    counts[val] = count;
    if (verbose && !keep) {
      message(utils.format('Removing feature %i key: [%s]', i, val));
    }
  });

  if (lyr.shapes) {
    lyr.shapes = lyr.shapes.filter(filter);
  }
  if (records) {
    lyr.data = new DataTable(records.filter(filter));
  }
  if (opts.verbose !== false) {
    message(utils.format('Retained %,d of %,d features', getFeatureCount(lyr), n));
  }
};
