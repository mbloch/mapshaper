/* @requires mapshaper-expressions, mapshaper-dataset-utils */

api.evaluateLayer = function(lyr, arcs, exp) {
  var n = MapShaper.getFeatureCount(lyr),
      compiled;

  // TODO: consider not creating a data table -- not needed if expression only references geometry
  if (n > 0 && !lyr.data) {
    lyr.data = new DataTable(n);
  }
  compiled = MapShaper.compileFeatureExpression(exp, lyr, arcs);
  // call compiled expression with id of each record
  Utils.repeat(n, compiled);
};
