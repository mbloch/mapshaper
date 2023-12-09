import cmd from '../mapshaper-cmd';
import { getStashedVar } from '../mapshaper-stash';
import { message, error, stop } from '../utils/mapshaper-logging';
import { compileFeatureExpression } from '../expressions/mapshaper-feature-expressions';
import { compileLayerExpression } from '../expressions/mapshaper-layer-expressions';

/*
cmd.define_v2 = function(catalog, opts) {
  if (!opts.expression) {
    stop('Missing an assignment expression');
  }
  compileLayerExpression(opts.expression, catalog, opts)();
};
*/

cmd.define = function(catalog, opts) {
  if (!opts.expression) {
    stop('Missing an assignment expression');
  }
  var defs = getStashedVar('defs');
  var compiled = compileFeatureExpression(opts.expression, {}, null,
    {no_warn: true, no_return: true});
  var result = compiled(null, defs);
};
