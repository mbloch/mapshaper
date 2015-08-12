/* @requires
mapshaper-expressions
mapshaper-dataset-utils
*/

api.evaluateEachFeature = function(lyr, arcs, exp, opts) {
  var n = MapShaper.getFeatureCount(lyr),
      compiled, filter;

  // TODO: consider not creating a data table -- not needed if expression only references geometry
  if (n > 0 && !lyr.data) {
    lyr.data = new DataTable(n);
  }
  if (opts && opts.where) {
    filter = MapShaper.compileFeatureExpression(opts.where, lyr, arcs);
  }
  compiled = MapShaper.compileFeatureExpression(exp, lyr, arcs);
  // call compiled expression with id of each record
  for (var i=0; i<n; i++) {
    if (!filter || filter(i)) {
      compiled(i);
    }
  }
};
