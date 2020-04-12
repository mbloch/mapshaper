import { compileCalcExpression } from '../commands/mapshaper-calc';

// get function that returns an object containing calculated values
export function getJoinCalc(src, exp) {
  var calc = compileCalcExpression({data: src}, null, exp);
  return function(ids, destRec) {
    if (!ids) ids = [];
    calc(ids, destRec);
  };
}
