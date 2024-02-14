
import cmd from '../mapshaper-cmd';
import { stop } from '../utils/mapshaper-logging';
import {
  inControlBlock,
  enterActiveBranch,
  enterInactiveBranch,
  inActiveBranch,
  blockIsComplete,
  jobIsStopped,
  enterBlock,
  leaveBlock
} from '../mapshaper-control-flow';
import { compileIfCommandExpression } from '../expressions/mapshaper-layer-expressions';

export function skipCommand(cmdName, job) {
  if (jobIsStopped(job)) return true;
  if (isControlFlowCommand(cmdName)) return false;
  return !inActiveBranch(job);
}

cmd.if = function(job, opts) {
  enterBlock(job);
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
  if (blockIsComplete(job)) {
    enterInactiveBranch(job);
  } else {
    enterActiveBranch(job);
  }
};

cmd.endif = function(job) {
  if (!inControlBlock(job)) {
    stop('-endif command must be preceded by an -if command.');
  }
  leaveBlock(job);
};

function isControlFlowCommand(cmd) {
  return ['if','elif','else','endif'].includes(cmd);
}

function test(catalog, opts) {
  if (opts.expression) {
    return compileIfCommandExpression(opts.expression, catalog, opts)();
  }
  return true;
}

function evaluateIf(job, opts) {
  if (!blockIsComplete(job) && test(job.catalog, opts)) {
    enterActiveBranch(job);
  } else {
    enterInactiveBranch(job);
  }
}
