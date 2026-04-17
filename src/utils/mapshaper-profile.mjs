// Lightweight hierarchical profiler.
// Intended for ad-hoc performance work on hot pipelines (e.g. addIntersectionCuts).
//
// Usage:
//   import { profileStart, profileEnd, profileWrap, ... } from './utils/mapshaper-profile';
//   profileStart('phase'); doWork(); profileEnd('phase');
//   var result = profileWrap('phase', () => doWork());
//
// When disabled (the default) every call short-circuits in ~one comparison; safe
// to leave in hot code paths. Enable from the CLI with the `-profile` command,
// from JS with enableProfiling(), or by setting the MAPSHAPER_PROFILE env var.
//
// The profiler tracks a stack of currently-open phases so calls can nest. Each
// unique stack path accumulates ms-elapsed and a call count. profileReport()
// returns a flat array; formatProfileReport() pretty-prints a tree.

var ENABLED = false;
var ROOT = makeNode('<root>');
var STACK = [ROOT];
var WALL_START = 0;

function makeNode(label) {
  return {
    label: label,
    totalMs: 0,
    selfMs: 0,
    calls: 0,
    childMsAccum: 0,
    children: Object.create(null)
  };
}

function nowMs() {
  if (typeof process !== 'undefined' && process.hrtime && process.hrtime.bigint) {
    // bigint -> number division: precision down to 1 microsecond is fine for our needs
    return Number(process.hrtime.bigint()) / 1e6;
  }
  if (typeof performance !== 'undefined' && performance.now) {
    return performance.now();
  }
  return Date.now();
}

export function enableProfiling() {
  ENABLED = true;
  WALL_START = nowMs();
}

export function disableProfiling() {
  ENABLED = false;
}

export function profileEnabled() {
  return ENABLED;
}

export function profileReset() {
  ROOT = makeNode('<root>');
  STACK = [ROOT];
  WALL_START = ENABLED ? nowMs() : 0;
}

// Open a new phase. Cheap (~one branch) when disabled.
export function profileStart(label) {
  if (!ENABLED) return;
  var parent = STACK[STACK.length - 1];
  var node = parent.children[label];
  if (!node) {
    node = makeNode(label);
    parent.children[label] = node;
  }
  node._t0 = nowMs();
  STACK.push(node);
}

export function profileEnd(label) {
  if (!ENABLED) return;
  var node = STACK[STACK.length - 1];
  if (label && node.label !== label) {
    // Mismatched labels usually mean an early return forgot to call profileEnd().
    // Walk up the stack until we find a match, closing the intervening frames.
    while (STACK.length > 1 && STACK[STACK.length - 1].label !== label) {
      profileEnd(STACK[STACK.length - 1].label);
    }
    node = STACK[STACK.length - 1];
    if (node.label !== label) return; // give up rather than throw
  }
  var elapsed = nowMs() - node._t0;
  node._t0 = 0;
  node.totalMs += elapsed;
  node.calls += 1;
  STACK.pop();
  var parent = STACK[STACK.length - 1];
  parent.childMsAccum += elapsed;
}

// Wrap a function call. Re-throws if the callback throws but still closes the
// phase so the stack stays consistent.
export function profileWrap(label, fn) {
  if (!ENABLED) return fn();
  profileStart(label);
  try {
    return fn();
  } finally {
    profileEnd(label);
  }
}

// Build a flat tree report: array of {depth, label, totalMs, selfMs, calls}.
export function profileReport() {
  var rows = [];
  function visit(node, depth) {
    if (depth > 0) {
      rows.push({
        depth: depth - 1,
        label: node.label,
        totalMs: node.totalMs,
        selfMs: Math.max(0, node.totalMs - node.childMsAccum),
        calls: node.calls
      });
    }
    var keys = Object.keys(node.children);
    keys.sort(function(a, b) {
      return node.children[b].totalMs - node.children[a].totalMs;
    });
    for (var i = 0; i < keys.length; i++) {
      visit(node.children[keys[i]], depth + 1);
    }
  }
  visit(ROOT, 0);
  return rows;
}

export function profileWallElapsedMs() {
  return ENABLED && WALL_START ? nowMs() - WALL_START : 0;
}

// Pretty-print the current report as a column-aligned tree.
export function formatProfileReport(opts) {
  var rows = profileReport();
  if (rows.length === 0) return '(profile is empty)';
  opts = opts || {};
  var indent = '  ';
  var lines = [];
  // header
  lines.push(['phase', 'total ms', 'self ms', 'calls'].join('\t'));
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var label = '';
    for (var j = 0; j < r.depth; j++) label += indent;
    label += r.label;
    lines.push([
      label,
      r.totalMs.toFixed(2),
      r.selfMs.toFixed(2),
      String(r.calls)
    ].join('\t'));
  }
  if (opts.includeWall) {
    lines.push('');
    lines.push('wall elapsed ms: ' + profileWallElapsedMs().toFixed(2));
  }
  return lines.join('\n');
}

// Honour an env var so users (and CI harnesses) can opt in without code changes.
if (typeof process !== 'undefined' && process.env && process.env.MAPSHAPER_PROFILE) {
  enableProfiling();
}
