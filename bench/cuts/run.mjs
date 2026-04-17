// Runner for addIntersectionCuts() benchmarks.
//
// Usage (from repo root):
//   node bench/cuts/run.mjs                     # run every case
//   node bench/cuts/run.mjs A-precincts-clean   # run a single case
//   node bench/cuts/run.mjs --runs 5            # change run count
//   node bench/cuts/run.mjs --tag baseline      # tag results in output
//   node bench/cuts/run.mjs --json results.json # write json results
//   node bench/cuts/run.mjs --inproc            # run timed iterations in this
//                                               # process (faster, noisier)
//
// By default the harness spawns a fresh node subprocess per timed iteration so
// V8 JIT / heap state cannot bleed between samples (necessary because the
// xx/yy/buildTopology pipeline is GC-bimodal). Use --inproc for quick local
// runs; expect a high-variance picture on the heavy cases.
//
// Output is a per-case wall-time table plus the median run's hierarchical
// addIntersectionCuts profile breakdown.

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { cases, findCase } from './cases.mjs';

var SELF = fileURLToPath(import.meta.url);
var BENCH_DIR = dirname(SELF);

var require = createRequire(import.meta.url);
var mapshaper = require('../../mapshaper.js');

// Pull the profiler off the bundled internal namespace so we share state with
// the instrumented hot path.
var profile = mapshaper.internal;
if (!profile.enableProfiling) {
  console.error('Profiler not exposed on mapshaper.internal — rebuild with the latest src/');
  process.exit(2);
}

function parseArgs(argv) {
  var opts = { runs: 0, tag: '', json: '', cases: [], inproc: false, child: false };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a === '--runs') opts.runs = parseInt(argv[++i], 10);
    else if (a === '--tag') opts.tag = argv[++i];
    else if (a === '--json') opts.json = argv[++i];
    else if (a === '--inproc') opts.inproc = true;
    else if (a === '--child') { opts.child = true; opts.childCase = argv[++i]; }
    else if (a === '-h' || a === '--help') { opts.help = true; }
    else opts.cases.push(a);
  }
  return opts;
}

var opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  console.log('Usage: node bench/cuts/run.mjs [caseId ...] [--runs N] [--tag T] [--json file] [--inproc]');
  console.log('Available cases:');
  cases.forEach(c => console.log('  ' + c.id + '\t' + c.label));
  process.exit(0);
}

function runChild(caseId) {
  var c = findCase(caseId);
  if (!c) { console.error('Unknown case: ' + caseId); process.exit(2); }
  profile.disableProfiling();
  return mapshaper.runCommands(c.argv() + ' -quiet').then(function() {
    profile.profileReset();
    profile.enableProfiling();
    var t0 = Number(process.hrtime.bigint()) / 1e6;
    return mapshaper.runCommands(c.argv() + ' -quiet').then(function() {
      var elapsed = Number(process.hrtime.bigint()) / 1e6 - t0;
      var report = profile.profileReport();
      process.stdout.write('\n##BENCH_RESULT##' + JSON.stringify({ elapsed: elapsed, report: report }) + '\n');
    });
  });
}

// Child mode: run a single timed iteration of one case and emit JSON on stdout.
if (opts.child) {
  runChild(opts.childCase).catch(function(e) {
    console.error(e);
    process.exit(1);
  });
} else {

var selected = opts.cases.length === 0
  ? cases
  : opts.cases.map(id => {
      var c = findCase(id);
      if (!c) throw new Error('Unknown case: ' + id);
      return c;
    });

function median(arr) {
  if (arr.length === 0) return 0;
  var sorted = arr.slice().sort((a, b) => a - b);
  var mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function nowMs() {
  return Number(process.hrtime.bigint()) / 1e6;
}

async function runOnce(c, capture) {
  if (capture) {
    profile.profileReset();
    profile.enableProfiling();
  } else {
    profile.disableProfiling();
  }
  var t0 = nowMs();
  await mapshaper.runCommands(c.argv() + ' -quiet');
  var elapsed = nowMs() - t0;
  var report = capture ? profile.profileReport() : null;
  if (capture) profile.disableProfiling();
  if (global.gc) global.gc(); // optional, run with `node --expose-gc`
  return { elapsed, report };
}

// Spawn a fresh node subprocess to run a single timed iteration of the case.
// Each child does its own warmup + measurement so JIT and heap state are not
// shared with the parent or other iterations.
function runOnceSubprocess(c) {
  var argv = ['--max-old-space-size=8000', SELF, '--child', c.id];
  var res = spawnSync(process.execPath, argv, {
    cwd: resolve(BENCH_DIR, '..', '..'),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  if (res.status !== 0) {
    throw new Error('Child failed for ' + c.id + ': ' + res.stderr);
  }
  var marker = '##BENCH_RESULT##';
  var idx = res.stdout.lastIndexOf(marker);
  if (idx === -1) {
    throw new Error('No bench result in child output: ' + res.stdout.slice(0, 500));
  }
  var jsonLine = res.stdout.slice(idx + marker.length).split('\n')[0];
  return JSON.parse(jsonLine);
}

function nodeOf(report, label) {
  return report.find(r => r.label === label);
}

function fmt(n, w) {
  var s = n.toFixed(2);
  return w ? s.padStart(w) : s;
}

function fmtRow(arr, widths) {
  return arr.map((s, i) => String(s).padEnd(widths[i])).join('  ');
}

async function runCase(c) {
  var totalRuns = opts.runs || c.runs || 5;
  var warmup = c.warmup === undefined ? 1 : c.warmup;
  var mode = opts.inproc ? 'inproc' : 'subproc';
  console.error('-> ' + c.label + '  (' + warmup + ' warmup + ' + totalRuns + ' timed, ' + mode + ')');
  if (opts.inproc) {
    for (var w = 0; w < warmup; w++) {
      await runOnce(c, false);
    }
  }
  var runs = [];
  for (var i = 0; i < totalRuns; i++) {
    var r = opts.inproc ? await runOnce(c, true) : runOnceSubprocess(c);
    runs.push(r);
    process.stderr.write('   run ' + (i + 1) + '/' + totalRuns + ': ' + r.elapsed.toFixed(0) + ' ms\n');
  }
  var elapsed = runs.map(r => r.elapsed);
  var medElapsed = median(elapsed);
  // pick the run closest to median wall time as the "representative" report
  var medIdx = elapsed.indexOf(medElapsed);
  if (medIdx === -1) {
    medIdx = elapsed.map((v, i) => [Math.abs(v - medElapsed), i]).sort((a, b) => a[0] - b[0])[0][1];
  }
  return {
    case: c.id,
    label: c.label,
    runs: elapsed,
    medianMs: medElapsed,
    minMs: Math.min.apply(null, elapsed),
    maxMs: Math.max.apply(null, elapsed),
    representativeReport: runs[medIdx].report
  };
}

function summariseReport(report) {
  if (!report) return {};
  var get = label => {
    var n = nodeOf(report, label);
    return n ? n.totalMs : 0;
  };
  return {
    addIntersectionCuts: get('addIntersectionCuts'),
    snapAndCut: get('snapAndCut'),
    snap: get('snap'),
    dedupCoords: get('dedupCoords'),
    cutPathsAtIntersections: get('cutPathsAtIntersections'),
    findSegmentIntersections: get('findSegmentIntersections'),
    stripeSetup: get('stripeSetup'),
    intersectSegments: get('intersectSegments'),
    dedupIntersections: get('dedupIntersections'),
    convertIntersectionsToCutPoints: get('convertIntersectionsToCutPoints'),
    sortCutPoints: get('sortCutPoints'),
    filterSortedCutPoints: get('filterSortedCutPoints'),
    rewriteVertexData: get('rewriteVertexData'),
    buildTopology: get('buildTopology'),
    cleanShapes: get('cleanShapes'),
    cleanArcReferences: get('cleanArcReferences'),
    NodeCollection1: get('NodeCollection#1'),
    NodeCollection2: get('NodeCollection#2'),
    cleanLayers: get('cleanLayers'),
    cleanPolygonLayerGeometry: get('cleanPolygonLayerGeometry'),
    cleanPolylineLayerGeometry: get('cleanPolylineLayerGeometry'),
    dissolvePolygonGroups2: get('dissolvePolygonGroups2'),
    'dpg2.NodeCollection': get('dpg2.NodeCollection'),
    'dpg2.MosaicIndex': get('dpg2.MosaicIndex'),
    'mi.buildPolygonMosaic': get('mi.buildPolygonMosaic'),
    'bpm.detachAcyclicArcs': get('bpm.detachAcyclicArcs'),
    'bpm.findMosaicRings': get('bpm.findMosaicRings'),
    'bpm.PathIndex': get('bpm.PathIndex'),
    'bpm.findEnclosingForCCW': get('bpm.findEnclosingForCCW'),
    'mi.ShapeArcIndex': get('mi.ShapeArcIndex'),
    'mi.PolygonTiler.ctor': get('mi.PolygonTiler.ctor'),
    'mi.assignTilesToShapes': get('mi.assignTilesToShapes'),
    'mi.tileShapeIndex.flatten': get('mi.tileShapeIndex.flatten'),
    'dpg2.removeGaps': get('dpg2.removeGaps'),
    'dpg2.dissolveTiles': get('dpg2.dissolveTiles'),
    'dpg2.fixTangentHoles': get('dpg2.fixTangentHoles'),
    filterFeatures: get('filterFeatures'),
    'dissolveArcs.body': get('dissolveArcs.body'),
    'dissolveArcs.translatePaths': get('dissolveArcs.translatePaths'),
    'dissolveArcs.dissolveArcCollection': get('dissolveArcs.dissolveArcCollection'),
    clipLayers: get('clipLayers'),
    mergeLayersForOverlay: get('mergeLayersForOverlay'),
    clipDissolvePolygonLayer2: get('clipDissolvePolygonLayer2'),
    clipLayersByLayer: get('clipLayersByLayer'),
    clipPolygons: get('clipPolygons'),
    'cp.dissolveTargetRings': get('cp.dissolveTargetRings'),
    'cp.openClipRoutes': get('cp.openClipRoutes'),
    'cp.PathIndex#1': get('cp.PathIndex#1'),
    'cp.clipShapes': get('cp.clipShapes'),
    'cp.findUndividedClip': get('cp.findUndividedClip'),
    'cp.PathIndex#2': get('cp.PathIndex#2'),
    'cp.findInteriorPaths': get('cp.findInteriorPaths')
  };
}

function printResultsTable(results) {
  var rows = [['case', 'min', 'med', 'max', 'aIC med', 'snap+cut', 'topo', 'cleanArc']];
  results.forEach(r => {
    var s = summariseReport(r.representativeReport);
    rows.push([
      r.case,
      fmt(r.minMs, 0),
      fmt(r.medianMs, 0),
      fmt(r.maxMs, 0),
      fmt(s.addIntersectionCuts, 0),
      fmt(s.snapAndCut, 0),
      fmt(s.buildTopology, 0),
      fmt(s.cleanArcReferences, 0)
    ]);
  });
  var widths = rows[0].map((_, col) => Math.max.apply(null, rows.map(r => String(r[col]).length)));
  console.log('\n=== wall-time summary (ms) ===');
  rows.forEach((row, idx) => {
    console.log(fmtRow(row, widths));
    if (idx === 0) console.log(widths.map(w => '-'.repeat(w)).join('  '));
  });
}

function printDetail(result) {
  console.log('\n--- detail: ' + result.label + ' (median run, ' + result.medianMs.toFixed(2) + ' ms) ---');
  if (!result.representativeReport) return;
  var rows = [['phase', 'total ms', 'self ms', 'calls']];
  result.representativeReport.forEach(r => {
    var label = '  '.repeat(r.depth) + r.label;
    rows.push([label, r.totalMs.toFixed(2), r.selfMs.toFixed(2), String(r.calls)]);
  });
  var widths = rows[0].map((_, col) => Math.max.apply(null, rows.map(r => String(r[col]).length)));
  rows.forEach((row, idx) => {
    var line = row[0].padEnd(widths[0])
      + '  ' + String(row[1]).padStart(widths[1])
      + '  ' + String(row[2]).padStart(widths[2])
      + '  ' + String(row[3]).padStart(widths[3]);
    console.log(line);
    if (idx === 0) console.log(widths.map(w => '-'.repeat(w)).join('  '));
  });
}

(async function main() {
  var results = [];
  for (var c of selected) {
    try {
      results.push(await runCase(c));
    } catch (e) {
      console.error('FAILED ' + c.id + ': ' + (e && e.stack || e));
    }
  }

  printResultsTable(results);
  results.forEach(printDetail);

  if (opts.json) {
    var payload = {
      tag: opts.tag,
      timestamp: new Date().toISOString(),
      node: process.version,
      results: results.map(r => ({
        case: r.case,
        label: r.label,
        runs: r.runs,
        medianMs: r.medianMs,
        minMs: r.minMs,
        maxMs: r.maxMs,
        report: r.representativeReport,
        summary: summariseReport(r.representativeReport)
      }))
    };
    writeFileSync(opts.json, JSON.stringify(payload, null, 2));
    console.error('Wrote ' + opts.json);
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});

} // end of else (non-child mode)
