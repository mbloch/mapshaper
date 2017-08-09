/* @requires
mapshaper-expressions
mapshaper-dataset-utils
*/

api.evaluateEachFeature = function(lyr, arcs, exp, opts) {
  var n = internal.getFeatureCount(lyr),
      compiled, filter;

  // TODO: consider not creating a data table -- not needed if expression only references geometry
  if (n > 0 && !lyr.data) {
    lyr.data = new DataTable(n);
  }
  if (opts && opts.where) {
    filter = internal.compileValueExpression(opts.where, lyr, arcs);
  }
  compiled = internal.compileFeatureExpression(exp, lyr, arcs, {context: internal.getStateVar('defs')});
  // call compiled expression with id of each record
  for (var i=0; i<n; i++) {
    if (!filter || filter(i)) {
      compiled(i);
    }
  }
};
