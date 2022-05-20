import cmd from '../mapshaper-cmd';
import { getStashedVar } from '../mapshaper-stash';
import { message, error, stop } from '../utils/mapshaper-logging';
import { compileFeatureExpression } from '../expressions/mapshaper-expressions';

cmd.define = function(opts) {
  if (!opts.expression) {
    stop('Missing an assignment expression');
  }
  var defs = getStashedVar('defs');
  var compiled = compileFeatureExpression(opts.expression, {}, null, {no_warn: true});
  var result = compiled(null, defs);
};
