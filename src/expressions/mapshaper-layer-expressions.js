import { getLayerProxy } from './mapshaper-layer-proxy';
import { compileExpressionToFunction } from './mapshaper-expressions';
import { stop } from '../utils/mapshaper-logging';
import cli from '../cli/mapshaper-cli-utils';

export function compileIfCommandExpression(expr, catalog, targ, opts) {
  var ctx = getLayerProxy(targ.layer, targ.dataset.arcs, opts);
  var exprOpts = Object.assign({returns: true}, opts);
  var func = compileExpressionToFunction(expr, exprOpts);

  ctx.layer_exists = function(name) {
    return !!catalog.findSingleLayer(name);
  };

  ctx.file_exists = function(file) {
    return cli.isFile(file);
  };

  return function() {
    try {
      return func.call(ctx, {}, ctx);
    } catch(e) {
      // if (opts.quiet) throw e;
      stop(e.name, "in expression [" + expr + "]:", e.message);
    }
  };
}
