import { getLayerProxy } from './mapshaper-layer-proxy';
import { compileExpressionToFunction } from './mapshaper-expressions';
import { stop } from '../utils/mapshaper-logging';
export function compileLayerExpression(expr, lyr, dataset, opts) {
  var proxy = getLayerProxy(lyr, dataset.arcs, opts);
  var exprOpts = Object.assign({returns: true}, opts);
  var func = compileExpressionToFunction(expr, exprOpts);
  var ctx = proxy;
  return function() {
    try {
      return func.call(proxy, {}, ctx);
    } catch(e) {
      // if (opts.quiet) throw e;
      stop(e.name, "in expression [" + expr + "]:", e.message);
    }
  };
}
