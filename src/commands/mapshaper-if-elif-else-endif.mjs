
import cmd from '../mapshaper-cmd';
import { layerIsEmpty } from '../dataset/mapshaper-layer-utils';
import { stop } from '../utils/mapshaper-logging';
import {
  resetControlFlow,
  inControlBlock,
  enterActiveBranch,
  enterInactiveBranch,
  inActiveBranch,
  blockWasActive,
  jobIsStopped
} from '../mapshaper-control-flow';
import { compileIfCommandExpression } from '../expressions/mapshaper-layer-expressions';

export function skipCommand(cmdName, job) {
  // allow all control commands to run
  if (jobIsStopped(job)) return true;
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

function test(catalog, opts) {
  // var targ = getTargetLayer(catalog, opts);
  if (opts.expression) {
    return compileIfCommandExpression(opts.expression, catalog, opts)();
  }
  // if (opts.empty) {
  //   return layerIsEmpty(targ.layer);
  // }
  // if (opts.not_empty) {
  //   return !layerIsEmpty(targ.layer);
  // }
  return true;
}

function evaluateIf(job, opts) {
  if (!blockWasActive(job) && test(job.catalog, opts)) {
    enterActiveBranch(job);
  } else {
    enterInactiveBranch(job);
  }
}

