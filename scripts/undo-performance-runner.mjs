import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import api from '../mapshaper.js';
import {
  createMemoryUndoPayloadBackend,
  createUndoPayloadStore
} from '../src/gui/gui-undo-payload-store';
import {
  getStoredUndoPayloadRefs,
  storeUndoUnits
} from '../src/gui/gui-undo-unit-store';

var internal = api.internal;

main().catch(function(err) {
  console.error(err && err.stack || err);
  process.exit(1);
});

async function main() {
  var args = parseArgs(process.argv.slice(2));
  var reports;
  if (args.files.length === 0) {
    usage();
    process.exit(1);
  }
  reports = [];
  for (var i = 0; i < args.files.length; i++) {
    reports.push(await runWorkflow(args.files[i], args));
  }
  if (args.out) {
    fs.mkdirSync(args.out, {recursive: true});
    fs.writeFileSync(path.join(args.out, 'undo-performance-summary.json'), JSON.stringify(reports, null, 2));
  }
  printSummary(reports);
}

async function runWorkflow(file, args) {
  var absFile = path.resolve(file);
  var dir = path.dirname(absFile);
  var content = fs.readFileSync(absFile, 'utf8');
  var metadata = parseMetadata(content);
  var commandString = internal.parseCommandFileContent(content);
  var commands = internal.parseCommands(commandString);
  var cwd = process.cwd();
  var setupCommands = [];
  var measuredCommands = commands;
  var runs = [];

  if (commands[0] && commands[0].name == 'i' && !args.includeImport) {
    setupCommands = commands.slice(0, 1);
    measuredCommands = commands.slice(1);
  }

  process.chdir(dir);
  try {
    for (var i = 0; i < args.repeat; i++) {
      runs.push(await runWorkflowPair(setupCommands, measuredCommands, args));
    }
  } finally {
    process.chdir(cwd);
  }

  return {
    file: absFile,
    name: metadata.name || path.basename(file),
    input: metadata.input || null,
    expected: metadata.expected || null,
    repeat: args.repeat,
    includeImport: args.includeImport,
    setupCommands: setupCommands.map(commandLabel),
    measuredCommands: measuredCommands.map(commandLabel),
    runs: runs,
    summary: summarizeWorkflowRuns(runs)
  };
}

async function runWorkflowPair(setupCommands, measuredCommands, args) {
  var disabled = await runWorkflowMode('disabled', setupCommands, measuredCommands, args);
  var enabled = await runWorkflowMode('enabled', setupCommands, measuredCommands, args);
  return {
    disabled: disabled,
    enabled: enabled,
    comparison: compareWorkflowModes(disabled, enabled)
  };
}

async function runWorkflowMode(mode, setupCommands, measuredCommands, args) {
  var job = new internal.Job();
  var store = mode == 'enabled' ? createBenchmarkStore() : null;
  var commands = [];
  var setupMillis = 0;
  var start = Date.now();

  if (setupCommands.length > 0) {
    setupMillis = await timeAsync(function() {
      return runCommands(setupCommands, job);
    });
  }
  for (var i = 0; i < measuredCommands.length; i++) {
    commands.push(await runMeasuredCommand(measuredCommands[i], job, store, args, i + 1));
  }
  return {
    mode: mode,
    setupMillis: setupMillis,
    commandMillis: sum(commands, 'commandMillis'),
    redoCaptureMillis: sum(commands, 'redoCaptureMillis'),
    storeMillis: sum(commands, 'storeMillis'),
    totalMillis: Date.now() - start - setupMillis,
    payloadBytes: store ? store.getStats().ownBytes : 0,
    payloadCount: store ? store.getStats().ownPayloadCount : 0,
    commands: commands
  };
}

async function runMeasuredCommand(command, job, store, args, commandId) {
  if (!store) {
    return runDisabledCommand(command, job, args);
  }
  return runUndoCommand(command, job, store, args, commandId);
}

async function runDisabledCommand(command, job, args) {
  var start = Date.now();
  var err = null;
  try {
    await runCommands([command], job);
  } catch(e) {
    err = e;
    if (!args.keepGoing) throw e;
  }
  return {
    command: commandLabel(command),
    error: err ? String(err.message || err) : null,
    commandMillis: Date.now() - start,
    redoCaptureMillis: 0,
    storeMillis: 0,
    totalMillis: Date.now() - start,
    unitCount: 0,
    restoreUnitCount: 0,
    units: {},
    payloadBytes: 0,
    payloadCount: 0
  };
}

async function runUndoCommand(command, job, store, args, commandId) {
  var tx = new internal.UndoTransaction(commandLabel(command));
  var start = Date.now();
  var commandMillis, redoCaptureMillis, storeMillis;
  var undoUnits, redoUnits, storedUndoUnits, storedRedoUnits;
  var statsBefore = store.getStats();
  var err = null;

  internal.setActiveUndoTransaction(tx);
  try {
    await runCommands([command], job);
  } catch(e) {
    err = e;
    if (!args.keepGoing) throw e;
  } finally {
    internal.clearActiveUndoTransaction(tx);
  }
  commandMillis = Date.now() - start;
  undoUnits = tx.getCapturedUnits();
  if (!err && undoUnits.some(isRestoreUnit)) {
    start = Date.now();
    redoUnits = tx.captureCurrentState();
    redoCaptureMillis = Date.now() - start;
    start = Date.now();
    storedUndoUnits = await storeUndoUnits(undoUnits, store, 'command-' + commandId, 'undo');
    storedRedoUnits = await storeUndoUnits(redoUnits, store, 'command-' + commandId, 'redo');
    storeMillis = Date.now() - start;
  } else {
    redoUnits = [];
    storedUndoUnits = [];
    storedRedoUnits = [];
    redoCaptureMillis = 0;
    storeMillis = 0;
  }
  return {
    command: commandLabel(command),
    error: err ? String(err.message || err) : null,
    commandMillis: commandMillis,
    redoCaptureMillis: redoCaptureMillis,
    storeMillis: storeMillis,
    totalMillis: commandMillis + redoCaptureMillis + storeMillis,
    unitCount: undoUnits.length,
    restoreUnitCount: undoUnits.filter(isRestoreUnit).length,
    units: countUnitTypes(undoUnits),
    redoUnits: countUnitTypes(redoUnits),
    payloadBytes: store.getStats().ownBytes - statsBefore.ownBytes,
    payloadCount: getStoredUndoPayloadRefs(storedUndoUnits).length +
      getStoredUndoPayloadRefs(storedRedoUnits).length
  };
}

function runCommands(commands, job) {
  return new Promise(function(resolve, reject) {
    internal.runParsedCommands(commands, job, function(err, nextJob) {
      if (err) reject(err);
      else resolve(nextJob);
    });
  });
}

function createBenchmarkStore() {
  return createUndoPayloadStore({
    backend: createMemoryUndoPayloadBackend(),
    sessionId: 'undo_perf',
    window: {localStorage: null}
  });
}

function isRestoreUnit(unit) {
  return unit.type != 'changed';
}

async function timeAsync(fn) {
  var start = Date.now();
  await fn();
  return Date.now() - start;
}

function parseMetadata(content) {
  var obj = {};
  content.split(/\r?\n/).forEach(function(line) {
    var match = /^#\s*([a-z0-9_-]+)\s*:\s*(.*?)\s*$/i.exec(line);
    if (match) obj[match[1].toLowerCase()] = match[2];
  });
  return obj;
}

function parseArgs(argv) {
  var args = {
    files: [],
    out: '',
    includeImport: false,
    keepGoing: false,
    repeat: 1
  };
  for (var i = 0; i < argv.length; i++) {
    var arg = argv[i];
    if (arg == '--out') {
      args.out = path.resolve(argv[++i]);
    } else if (arg == '--include-import') {
      args.includeImport = true;
    } else if (arg == '--keep-going') {
      args.keepGoing = true;
    } else if (arg == '--repeat') {
      args.repeat = Math.max(1, +argv[++i] || 1);
    } else if (arg == '--help' || arg == '-h') {
      usage();
      process.exit(0);
    } else {
      args.files.push(arg);
    }
  }
  return args;
}

function printSummary(workflows) {
  workflows.forEach(function(workflow) {
    console.log('\n' + workflow.name);
    console.log('  file:', workflow.file);
    if (workflow.input) console.log('  input:', workflow.input);
    if (workflow.expected) console.log('  expected:', workflow.expected);
    if (workflow.setupCommands.length > 0) {
      console.log('  setup:', workflow.setupCommands.join(' | '));
    }
    console.log('  disabled:', workflow.summary.disabledTotalMillis + 'ms');
    console.log('  enabled: ', workflow.summary.enabledTotalMillis + 'ms',
      '(+' + workflow.summary.overheadMillis + 'ms, ' + workflow.summary.overheadPct + '%)');
    console.log('  payloads:', workflow.summary.payloadCount,
      formatBytes(workflow.summary.payloadBytes));
    workflow.summary.commands.forEach(function(command) {
      console.log('    ' + command.command + ': +' + command.overheadMillis + 'ms',
        'payloads=' + command.payloadCount,
        formatBytes(command.payloadBytes),
        'units=' + summarizeUnits(command.units));
    });
  });
}

function summarizeWorkflowRuns(runs) {
  var disabledTotals = runs.map(function(run) { return run.disabled.totalMillis; });
  var enabledTotals = runs.map(function(run) { return run.enabled.totalMillis; });
  var comparisons = runs.map(function(run) { return run.comparison; });
  return {
    disabledTotalMillis: round(mean(disabledTotals)),
    enabledTotalMillis: round(mean(enabledTotals)),
    overheadMillis: round(mean(comparisons.map(function(o) { return o.overheadMillis; }))),
    overheadPct: round(mean(comparisons.map(function(o) { return o.overheadPct; }))),
    payloadBytes: round(mean(runs.map(function(run) { return run.enabled.payloadBytes; }))),
    payloadCount: round(mean(runs.map(function(run) { return run.enabled.payloadCount; }))),
    commands: summarizeCommandComparisons(comparisons)
  };
}

function summarizeCommandComparisons(comparisons) {
  var byCommand = {};
  comparisons.forEach(function(comparison) {
    comparison.commands.forEach(function(command) {
      byCommand[command.command] = byCommand[command.command] || [];
      byCommand[command.command].push(command);
    });
  });
  return Object.keys(byCommand).map(function(command) {
    var items = byCommand[command];
    return {
      command: command,
      overheadMillis: round(mean(items.map(function(item) { return item.overheadMillis; }))),
      overheadPct: round(mean(items.map(function(item) { return item.overheadPct; }))),
      payloadBytes: round(mean(items.map(function(item) { return item.payloadBytes; }))),
      payloadCount: round(mean(items.map(function(item) { return item.payloadCount; }))),
      units: mergeUnitCounts(items.map(function(item) { return item.units; }))
    };
  });
}

function compareWorkflowModes(disabled, enabled) {
  var commands = enabled.commands.map(function(command, i) {
    var baseline = disabled.commands[i];
    var overhead = command.totalMillis - baseline.totalMillis;
    return {
      command: command.command,
      disabledMillis: baseline.totalMillis,
      enabledMillis: command.totalMillis,
      overheadMillis: overhead,
      overheadPct: percent(overhead, baseline.totalMillis),
      payloadBytes: command.payloadBytes,
      payloadCount: command.payloadCount,
      units: command.units
    };
  });
  return {
    overheadMillis: enabled.totalMillis - disabled.totalMillis,
    overheadPct: percent(enabled.totalMillis - disabled.totalMillis, disabled.totalMillis),
    commands: commands
  };
}

function countUnitTypes(units) {
  var counts = {};
  units.forEach(function(unit) {
    counts[unit.type] = (counts[unit.type] || 0) + 1;
  });
  return counts;
}

function mergeUnitCounts(items) {
  var counts = {};
  items.forEach(function(item) {
    Object.keys(item).forEach(function(type) {
      counts[type] = (counts[type] || 0) + item[type];
    });
  });
  Object.keys(counts).forEach(function(type) {
    counts[type] = round(counts[type] / items.length);
  });
  return counts;
}

function summarizeUnits(units) {
  return Object.keys(units).map(function(type) {
    return type + ':' + units[type];
  }).join(',') || 'none';
}

function sum(items, field) {
  return items.reduce(function(memo, item) {
    return memo + item[field];
  }, 0);
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce(function(sum, val) {
    return sum + val;
  }, 0) / values.length;
}

function percent(num, denom) {
  return denom > 0 ? round(num / denom * 100) : 0;
}

function round(num) {
  return Math.round(num * 10) / 10;
}

function formatBytes(bytes) {
  var units = ['B', 'KB', 'MB', 'GB'];
  var unit = 0;
  while (bytes >= 1024 && unit < units.length - 1) {
    bytes /= 1024;
    unit++;
  }
  return round(bytes) + units[unit];
}

function commandLabel(cmd) {
  var args = cmd._ && cmd._.length > 0 ? ' ' + cmd._.join(' ') : '';
  return '-' + cmd.name + args;
}

function usage() {
  var name = path.basename(fileURLToPath(import.meta.url));
  console.log('Usage: node --import ./test/_register.mjs scripts/' + name + ' [--repeat n] [--out dir] [--include-import] [--keep-going] workflow.txt ...');
}
