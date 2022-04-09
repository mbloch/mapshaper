import { error } from './utils/mapshaper-logging';

// This module provides a way for multiple jobs to run together asynchronously
// while keeping job-level context variables (like "defs") separate.

var stash = {};

export function stashVar(key, val) {
  if (key in stash) {
    error('Tried to replace a stashed variable:', key);
  }
  stash[key] = val;
}

export function getStashedVar(key) {
  if (key in stash === false) {
    return undefined; // to support running commands in tests
    // error('Tried to read a nonexistent variable from the stash:', key);
  }
  return stash[key];
}

export function clearStash() {
  stash = {};
}
