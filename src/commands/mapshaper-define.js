import cmd from '../mapshaper-cmd';
import { getStateVar } from '../mapshaper-state';
import { message, error, stop } from '../utils/mapshaper-logging';
import { compileFeatureExpression } from '../expressions/mapshaper-expressions';

cmd.define = function(opts) {
  if (!opts.expression) {
    stop('Missing an assignment expression');
  }
  var defs = getStateVar('defs');
  var compiled = compileFeatureExpression(opts.expression, {}, null, {});
  var result = compiled(null, defs);
};
