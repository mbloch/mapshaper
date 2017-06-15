/* @requires
mapshaper-expressions
mapshaper-dataset-utils
*/

api.uniq = function(lyr, arcs, opts) {
  var n = internal.getFeatureCount(lyr),
      compiled = internal.compileValueExpression(opts.expression, lyr, arcs),
      index = {},
      flags = [],
      verbose = !!opts.verbose,
      records = lyr.data ? lyr.data.getRecords() : null,
      f = function(d, i) {return !flags[i];};

  utils.repeat(n, function(i) {
    var val = compiled(i);
    flags[i] = val in index;
    if (verbose && index[val]) {
      message(utils.format('Removing feature %i key: [%s]', i, val));
    }
    index[val] = true;
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
