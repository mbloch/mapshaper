/* @requires
mapshaper-expressions
mapshaper-dataset-utils
*/

api.sortFeatures = function(lyr, arcs, opts) {
  var n = MapShaper.getFeatureCount(lyr),
      ascending = !opts.descending,
      compiled = MapShaper.compileFeatureExpression(opts.expression, lyr, arcs),
      values = [];

  utils.repeat(n, function(i) {
    values.push(compiled(i));
  });

  var ids = utils.getSortedIds(values, ascending);
  if (lyr.shapes) {
    utils.reorderArray(lyr.shapes, ids);
  }
  if (lyr.data) {
    utils.reorderArray(lyr.data.getRecords(), ids);
  }
};
