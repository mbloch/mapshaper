
export function stopJob(job) {
  job.stopped = true;
}

export function jobIsStopped(job) {
  return job.stopped === true;
}

export function inControlBlock(job) {
  return getStack(job).length > 0;
}

export function enterBlock(job) {
  var stack = getStack(job);
  // skip over a block if it is inside an inactive branch
  stack.push({
    active: false,
    complete: !inActiveBranch(job)
  });
}

export function leaveBlock(job) {
  var stack = getStack(job);
  stack.pop();
}

export function enterActiveBranch(job) {
  var block = getCurrentBlock(job);
  block.active = true;
  block.complete = true;
}

export function enterInactiveBranch(job) {
  var block = getCurrentBlock(job);
  block.active = false;
}

export function blockIsComplete(job) {
  var block = getCurrentBlock(job);
  return block.complete;
}

function getCurrentBlock(job) {
  var stack = getStack(job);
  return stack[stack.length-1];
}

// A branch is considered to be active if it and all its parents are active
// (Main branch is considered to be active)
export function inActiveBranch(job) {
  var stack = getStack(job);
  return stack.length === 0 || stack.every(block => block.active);
}

function getStack(job) {
  job.control = job.control || {stack: []};
  return job.control.stack;
}
