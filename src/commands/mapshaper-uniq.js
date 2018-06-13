/* @requires
mapshaper-expressions
mapshaper-dataset-utils
*/

api.uniq = function(lyr, arcs, opts) {
  var n = internal.getFeatureCount(lyr),
      compiled = internal.compileValueExpression(opts.expression, lyr, arcs),
      maxCount = opts.max_count || 1,
      counts = {},
      flags = [],
      verbose = !!opts.verbose,
      records = lyr.data ? lyr.data.getRecords() : null,
      f = function(d, i) {return !flags[i];};

  utils.repeat(n, function(i) {
    var val = compiled(i);
    var count = val in counts ? counts[val] + 1 : 1;
    flags[i] = count > maxCount;
    counts[val] = count;
    if (verbose && !flags[i]) {
      message(utils.format('Removing feature %i key: [%s]', i, val));
    }
  });

  if (lyr.shapes) {
    lyr.shapes = lyr.shapes.filter(f);
  }
  if (records) {
    lyr.data = new DataTable(records.filter(f));
  }
  if (opts.verbose !== false) {
    message(utils.format('Retained %,d of %,d features', internal.getFeatureCount(lyr), n));
  }
};
