/* @requires
mapshaper-expressions
mapshaper-dataset-utils
mapshaper-field-calculator
*/

api.evaluateEachFeature = function(lyr, arcs, exp) {
  var n = MapShaper.getFeatureCount(lyr),
      compiled;

  // TODO: consider not creating a data table -- not needed if expression only references geometry
  if (n > 0 && !lyr.data) {
    lyr.data = new DataTable(n);
  }
  compiled = MapShaper.compileFeatureExpression(exp, lyr, arcs);
  // call compiled expression with id of each record
  utils.repeat(n, compiled);
};

api.calc = function(lyr, arcs, opts) {
  var results = MapShaper.getCalcResults(lyr, arcs, opts);
  utils.forEach(results, function(val, key) {
    var msg = key + ":\t" + val;
    message(msg);
  });
};
