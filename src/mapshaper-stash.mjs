// This module provides a way for multiple jobs to run together asynchronously
// while keeping job-level context variables (like "defs") separate.
//
// We deliberately do NOT import from mapshaper-logging here -- the logging
// module imports from this one, and avoiding the back-edge keeps the
// foundational dependency graph acyclic. (The single error path below is
// an internal-bug guard, not a user-facing message, so a plain Error is
// adequate.)

var stash = {};

export function stashVar(key, val) {
  if (key in stash) {
    throw new Error('Tried to replace a stashed variable: ' + key);
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
