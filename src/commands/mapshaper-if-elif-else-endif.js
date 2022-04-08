
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
import { compileIfCommandExpression } from '../expressions/mapshaper-layer-expressions';

export function skipCommand(cmdName, job) {
  // allow all control commands to run
  if (isControlFlowCommand(cmdName)) return false;
  return inControlBlock(job) && !inActiveBranch(job);
}

cmd.if = function(job, opts) {
  if (inControlBlock(job)) {
    stop('Nested -if commands are not supported.');
  }
  evaluateIf(job, opts);
};

cmd.elif = function(job, opts) {
  if (!inControlBlock(job)) {
    stop('-elif command must be preceded by an -if command.');
  }
  evaluateIf(job, opts);
};

cmd.else = function(job) {
  if (!inControlBlock(job)) {
    stop('-else command must be preceded by an -if command.');
  }
  if (blockWasActive(job)) {
    enterInactiveBranch(job);
  } else {
    enterActiveBranch(job);
  }
};

cmd.endif = function(job) {
  if (!inControlBlock(job)) {
    stop('-endif command must be preceded by an -if command.');
  }
  resetControlFlow(job);
};

function isControlFlowCommand(cmd) {
  return ['if','elif','else','endif'].includes(cmd);
}

function testLayer(catalog, opts) {
  var targ = getTargetLayer(catalog, opts);
  if (opts.expression) {
    return compileIfCommandExpression(opts.expression, catalog, targ, opts)();
  }
  if (opts.empty) {
    return layerIsEmpty(targ.layer);
  }
  if (opts.not_empty) {
    return !layerIsEmpty(targ.layer);
  }
  return true;
}

function evaluateIf(job, opts) {
  if (!blockWasActive(job) && testLayer(job.catalog, opts)) {
    enterActiveBranch(job);
  } else {
    enterInactiveBranch(job);
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
