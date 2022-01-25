
import cmd from '../mapshaper-cmd';
import { layerIsEmpty } from '../dataset/mapshaper-layer-utils';
import { stop } from '../utils/mapshaper-logging';
import {
  resetControlFlow,
  inControlBlock,
  enterActiveBranch,
  enterInactiveBranch,
  inActiveBranch,
  blockWasActive
} from '../mapshaper-control-flow';
import { compileLayerExpression } from '../expressions/mapshaper-layer-expressions';

export function skipCommand(cmdName) {
  // allow all control commands to run
  if (isControlFlowCommand(cmdName)) return false;
  return inControlBlock() && !inActiveBranch();
}

cmd.if = function(catalog, opts) {
  if (inControlBlock()) {
    stop('Nested -if commands are not supported.');
  }
  evaluateIf(catalog, opts);
};

cmd.elif = function(catalog, opts) {
  if (!inControlBlock()) {
    stop('-elif command must be preceded by an -if command.');
  }
  evaluateIf(catalog, opts);
};

cmd.else = function() {
  if (!inControlBlock()) {
    stop('-else command must be preceded by an -if command.');
  }
  if (blockWasActive()) {
    enterInactiveBranch();
  } else {
    enterActiveBranch();
  }
};

cmd.endif = function() {
  if (!inControlBlock()) {
    stop('-endif command must be preceded by an -if command.');
  }
  resetControlFlow();
};

function isControlFlowCommand(cmd) {
  return ['if','elif','else','endif'].includes(cmd);
}

function testLayer(catalog, opts) {
  var targ = getTargetLayer(catalog, opts);
  if (opts.expression) {
    return compileLayerExpression(opts.expression, targ.layer, targ.dataset, opts)();
  }
  if (opts.empty) {
    return layerIsEmpty(targ.layer);
  }
  if (opts.not_empty) {
    return !layerIsEmpty(targ.layer);
  }
  return true;
}

function evaluateIf(catalog, opts) {
  if (!blockWasActive() && testLayer(catalog, opts)) {
    enterActiveBranch();
  } else {
    enterInactiveBranch();
  }
}

// layerId: optional layer identifier
//
function getTargetLayer(catalog, opts) {
  var layerId = opts.layer || opts.target;
  var targets = catalog.findCommandTargets(layerId);
  if (targets.length === 0) {
    if (layerId) {
      stop('Layer not found:', layerId);
    } else {
      stop('Missing a target layer.');
    }
  }
  if (targets.length > 1 || targets[0].layers.length > 1) {
    stop('Command requires a single target layer.');
  }
  return {
    layer: targets[0].layers[0],
    dataset: targets[0].dataset
  };
}
