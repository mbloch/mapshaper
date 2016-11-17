/* @requires
mapshaper-expressions
mapshaper-dataset-utils
*/

api.uniq = function(lyr, arcs, opts) {
  var n = MapShaper.getFeatureCount(lyr),
      compiled = MapShaper.compileValueExpression(opts.expression, lyr, arcs),
      index = {},
      flags = [],
      f = function(d, i) {return !flags[i];};

  utils.repeat(n, function(i) {
    var val = compiled(i);
    flags[i] = val in index;
    index[val] = true;
  });

  if (lyr.shapes) {
    lyr.shapes = lyr.shapes.filter(f);
  }
  if (lyr.data) {
    lyr.data = new DataTable(lyr.data.getRecords().filter(f));
  }
  if (opts.verbose !== false) {
    message(utils.format('[uniq] Retained %,d of %,d features', MapShaper.getFeatureCount(lyr), n));
  }
};
