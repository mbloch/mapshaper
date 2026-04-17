// Compare two JSON benchmark result files produced by run.mjs.
//
// Usage:
//   node bench/cuts/compare.mjs baseline.json after.json
//
// Output: per-case wall-time delta + per-phase delta of the addIntersectionCuts
// breakdown, percentage relative to baseline.

import { readFileSync } from 'node:fs';

var [, , baselinePath, afterPath] = process.argv;
if (!baselinePath || !afterPath) {
  console.error('Usage: node bench/cuts/compare.mjs baseline.json after.json');
  process.exit(2);
}

var baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
var after = JSON.parse(readFileSync(afterPath, 'utf8'));

function indexBy(arr, key) {
  var out = {};
  arr.forEach(o => { out[o[key]] = o; });
  return out;
}

var baseIdx = indexBy(baseline.results, 'case');
var afterIdx = indexBy(after.results, 'case');

function pct(b, a) {
  if (!b) return ' n/a';
  var d = (a - b) / b * 100;
  var sign = d >= 0 ? '+' : '';
  return sign + d.toFixed(1) + '%';
}

function fmt(n) { return (n || 0).toFixed(2); }

console.log('\n=== wall-time delta (ms, %) ===  ' + (baseline.tag || 'baseline') + ' -> ' + (after.tag || 'after'));
var keys = Object.keys(baseIdx).filter(k => afterIdx[k]);
var rows = [['case', 'base med', 'after med', 'delta', 'aIC base', 'aIC after', 'aIC delta']];
keys.forEach(k => {
  var b = baseIdx[k], a = afterIdx[k];
  var bAic = (b.summary && b.summary.addIntersectionCuts) || 0;
  var aAic = (a.summary && a.summary.addIntersectionCuts) || 0;
  rows.push([
    k,
    fmt(b.medianMs),
    fmt(a.medianMs),
    pct(b.medianMs, a.medianMs),
    fmt(bAic),
    fmt(aAic),
    pct(bAic, aAic)
  ]);
});
var widths = rows[0].map((_, col) => Math.max.apply(null, rows.map(r => String(r[col]).length)));
rows.forEach((row, i) => {
  console.log(row.map((s, ci) => String(s).padEnd(widths[ci])).join('  '));
  if (i === 0) console.log(widths.map(w => '-'.repeat(w)).join('  '));
});

// Per-phase delta tables for each case
keys.forEach(k => {
  var b = baseIdx[k].summary || {};
  var a = afterIdx[k].summary || {};
  console.log('\n--- ' + k + ' phase deltas ---');
  var phaseRows = [['phase', 'base', 'after', 'delta']];
  Object.keys(b).forEach(phase => {
    if (!b[phase] && !a[phase]) return;
    phaseRows.push([phase, fmt(b[phase]), fmt(a[phase]), pct(b[phase], a[phase])]);
  });
  var w = phaseRows[0].map((_, col) => Math.max.apply(null, phaseRows.map(r => String(r[col]).length)));
  phaseRows.forEach((row, i) => {
    console.log(row.map((s, ci) => String(s).padEnd(w[ci])).join('  '));
    if (i === 0) console.log(w.map(x => '-'.repeat(x)).join('  '));
  });
});
