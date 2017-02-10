/* @requires mapshaper-calc */

// get function that returns an object containing calculated values
MapShaper.getJoinCalc = function(src, exp) {
  var nullRec = {};
  var calc = MapShaper.compileCalcExpression({data: src}, null, exp);

  MapShaper.getAssignedVars(exp).forEach(function(key) {
    nullRec[key] = null;
  });

  return function(ids, destRec) {
    if (ids && ids.length > 0) {
      calc(ids, destRec);
    } else {
      utils.extend(destRec, nullRec);
    }
  };
};
