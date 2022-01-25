import { getStateVar, setStateVar } from './mapshaper-state';

export function resetControlFlow() {
  setStateVar('control', null);
}

export function inControlBlock() {
  var state = getState();
  return !!state.inControlBlock;
}

export function enterActiveBranch() {
  var state = getState();
  state.inControlBlock = true;
  state.active = true;
  state.complete = true;
}

export function enterInactiveBranch() {
  var state = getState();
  state.inControlBlock = true;
  state.active = false;
}

export function blockWasActive() {
  return !!getState().complete;
}

export function inActiveBranch() {
  return !!getState().active;
}

function getState() {
  var o = getStateVar('control') || setStateVar('control', {}) || getStateVar('control');
  return o;
}
