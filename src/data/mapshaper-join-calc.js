/* @requires mapshaper-calc */

// get function that returns an object containing calculated values
MapShaper.getJoinCalc = function(src, exp) {
  var calc = MapShaper.compileCalcExpression({data: src}, null, exp);
  return function(ids, destRec) {
    if (!ids) ids = [];
    calc(ids, destRec);
  };
};
