import { getLayerProxy, getNullLayerProxy } from './mapshaper-layer-proxy';
import { compileExpressionToFunction } from './mapshaper-expressions';
import { stop } from '../utils/mapshaper-logging';
import cli from '../cli/mapshaper-cli-utils';
import { getStashedVar } from '../mapshaper-stash';


export function compileIfCommandExpression(expr, catalog, opts) {
  return compileLayerExpression(expr, catalog, opts);
}


export function compileLayerExpression(expr, catalog, opts) {
  var targetId = opts.layer || opts.target || null;
  var targets = catalog.findCommandTargets(targetId);
  var isSingle = targets.length == 1 && targets[0].layers.length == 1;
  if (targets.length === 0 && targetId) {
    stop('Layer not found:', targetId);
  }
  var defs = getStashedVar('defs') || {};

  var ctx;
  if (isSingle) {
    ctx = getLayerProxy(targets[0].layers[0], targets[0].dataset.arcs, opts);
  } else {
    ctx = getNullLayerProxy(targets);
  }
  ctx.global = defs; // TODO: remove duplication with mapshaper.expressions.mjs
  var func = compileExpressionToFunction(expr, opts);

  // @geoType: optional geometry type (polygon, polyline, point, null);
  ctx.layer_exists = function(name, geoType) {
    try {
      var targets = catalog.findCommandTargets(name, geoType);
      if (targets.length > 0) return true;
    } catch(e) {}
    return false;
  };

  ctx.file_exists = function(file) {
    return cli.isFile(file);
  };

  return function() {
    try {
      return func.call(ctx, defs, ctx);
    } catch(e) {
      // if (opts.quiet) throw e;
      stop(e.name, "in expression [" + expr + "]:", e.message);
    }
  };
}
