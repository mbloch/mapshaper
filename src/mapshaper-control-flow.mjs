
export function resetControlFlow(job) {
  job.control = null;
}

export function stopJob(job) {
  getState(job).stopped = true;
}

export function jobIsStopped(job) {
  return getState(job).stopped === true;
}

export function inControlBlock(job) {
  return !!getState(job).inControlBlock;
}

export function enterActiveBranch(job) {
  var state = getState(job);
  state.inControlBlock = true;
  state.active = true;
  state.complete = true;
}

export function enterInactiveBranch(job) {
  var state = getState(job);
  state.inControlBlock = true;
  state.active = false;
}

export function blockWasActive(job) {
  return !!getState(job).complete;
}

export function inActiveBranch(job) {
  return !!getState(job).active;
}

function getState(job) {
  return job.control || (job.control = {});
}
