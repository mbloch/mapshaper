// Count how often segmentIntersection() takes the robust/fast/touches/reject
// paths on each benchmark case. Run in-process so we can observe the counters
// after the mapshaper pipeline finishes.
//
// Usage: node --max-old-space-size=8192 bench/cuts/robust-stats.mjs [case-id...]

import { createRequire } from 'node:module';
import { cases, findCase } from './cases.mjs';

var require = createRequire(import.meta.url);
var mapshaper = require('../../mapshaper.js');
var internal = mapshaper.internal;

if (!internal.segmentIntersectionStats) {
  console.error('Rebuild mapshaper.js — segmentIntersectionStats not exported');
  process.exit(2);
}

var ids = process.argv.slice(2);
var toRun = ids.length === 0 ? cases : ids.map(function(id) {
  var c = findCase(id);
  if (!c) { console.error('Unknown case:', id); process.exit(2); }
  return c;
});

function fmt(n) { return n.toLocaleString('en-US'); }
function pct(part, whole) {
  if (!whole) return '0.0%';
  return (part / whole * 100).toFixed(1) + '%';
}

async function run(c) {
  internal.segmentIntersectionStatsReset();
  var t0 = Number(process.hrtime.bigint()) / 1e6;
  await mapshaper.runCommands(c.argv() + ' -quiet');
  var elapsed = Number(process.hrtime.bigint()) / 1e6 - t0;
  var s = internal.segmentIntersectionStats();
  console.log('\n=== ' + c.id + '  (wall ' + elapsed.toFixed(0) + ' ms) ===');
  console.log('  calls                ', fmt(s.calls));
  console.log('  touches              ', fmt(s.touches), ' (' + pct(s.touches, s.calls) + ' of calls)');
  console.log('  endpointHits         ', fmt(s.endpointHits), ' (' + pct(s.endpointHits, s.calls) + ')');
  console.log('  crossCandidates      ', fmt(s.crossCandidates));
  console.log('    rejected by fast   ', fmt(s.crossRejectedFast), ' (' + pct(s.crossRejectedFast, s.crossCandidates) + ' of candidates)');
  var passed = s.crossCandidates - s.crossRejectedFast;
  console.log('    passed fast hit    ', fmt(passed));
  console.log('    -> robust BigInt   ', fmt(s.crossRobust), ' (' + pct(s.crossRobust, passed) + ' of passed)');
  console.log('    -> fp fast path    ', fmt(s.crossFast), ' (' + pct(s.crossFast, passed) + ' of passed)');
  console.log('    null result        ', fmt(s.crossNull));
}

for (var i = 0; i < toRun.length; i++) {
  await run(toRun[i]);
}
