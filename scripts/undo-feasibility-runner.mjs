import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import api from '../mapshaper.js';
import {
  captureModelState,
  createRuntimeIdTracker,
  diffModelStates
} from './undo-feasibility-monitor.mjs';

var internal = api.internal;

var DEFAULT_POLICY = {
  maxStates: 20,
  maxBytes: 256 * 1024 * 1024,
  largeChangeBytes: 64 * 1024 * 1024,
  captureMode: 'diagnostic',
  sessionHistory: 'audit-log'
};

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
    fs.writeFileSync(path.join(args.out, 'summary.json'), JSON.stringify(reports, null, 2));
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
  var job = new internal.Job();
  var tracker = createRuntimeIdTracker();
  var cwd = process.cwd();
  var reports = [];
  var setupCommands = [];
  var measuredCommands = commands;
  var setupMillis = 0;

  if (commands[0] && commands[0].name == 'i' && !args.includeImport) {
    setupCommands = commands.slice(0, 1);
    measuredCommands = commands.slice(1);
  }

  process.chdir(dir);
  try {
    if (setupCommands.length > 0) {
      setupMillis = await timeAsync(function() {
        return runCommands(setupCommands, job);
      });
    }
    for (var i = 0; i < measuredCommands.length; i++) {
      reports.push(await runMeasuredCommand(measuredCommands[i], job, tracker, args));
    }
  } finally {
    process.chdir(cwd);
  }

  var report = {
    file: absFile,
    name: metadata.name || path.basename(file),
    input: metadata.input || null,
    expected: metadata.expected || null,
    commandCount: commands.length,
    setupCommands: setupCommands.map(commandLabel),
    setupMillis: setupMillis,
    reports: reports
  };

  if (args.out) {
    fs.mkdirSync(args.out, {recursive: true});
    fs.writeFileSync(
      path.join(args.out, path.basename(file, path.extname(file)) + '.json'),
      JSON.stringify(report, null, 2)
    );
  }
  return report;
}

async function runMeasuredCommand(command, job, tracker, args) {
  var before = captureModelState(job.catalog, tracker);
  var start = Date.now();
  var err = null;
  try {
    await runCommands([command], job);
  } catch(e) {
    err = e;
    if (!args.keepGoing) throw e;
  }
  var afterCaptureStart = Date.now();
  var after = captureModelState(job.catalog, tracker);
  return diffModelStates(before, after, {
    commandString: commandLabel(command),
    commandNames: [command.name],
    error: err,
    policy: DEFAULT_POLICY,
    timings: {
      beforeCaptureMillis: 0,
      afterCaptureMillis: Date.now() - afterCaptureStart,
      elapsedMillis: Date.now() - start
    }
  });
}

function runCommands(commands, job) {
  return new Promise(function(resolve, reject) {
    internal.runParsedCommands(commands, job, function(err, nextJob) {
      if (err) reject(err);
      else resolve(nextJob);
    });
  });
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
    keepGoing: false
  };
  for (var i = 0; i < argv.length; i++) {
    var arg = argv[i];
    if (arg == '--out') {
      args.out = path.resolve(argv[++i]);
    } else if (arg == '--include-import') {
      args.includeImport = true;
    } else if (arg == '--keep-going') {
      args.keepGoing = true;
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
      console.log('  setup:', workflow.setupCommands.join(' | '), '(' + workflow.setupMillis + 'ms)');
    }
    workflow.reports.forEach(function(report) {
      var changes = summarizeChanges(report.changes);
      console.log('  ' + report.command);
      console.log('    time:', report.timings.elapsedMillis + 'ms',
        'storage:', report.storage.strategy, report.storage.displaySize,
        'changes:', changes || 'none');
    });
  });
}

function summarizeChanges(changes) {
  var parts = [];
  var datasets = summarizeDatasetChanges(changes.datasets);
  var layers = summarizeLayerChanges(changes.layers);
  if (changes.catalog) parts.push('catalog');
  if (changes.selection) parts.push('selection');
  if (datasets) parts.push(datasets);
  if (layers) parts.push(layers);
  return parts.join(', ');
}

function summarizeDatasetChanges(changes) {
  var counts = countFields(changes, ['arcs', 'info', 'layerOrder']);
  var added = changes.filter(function(change) { return change.status == 'added'; }).length;
  var removed = changes.filter(function(change) { return change.status == 'removed'; }).length;
  var parts = [];
  if (added) parts.push('datasets added=' + added);
  if (removed) parts.push('datasets removed=' + removed);
  Object.keys(counts).forEach(function(key) {
    if (counts[key]) parts.push('datasets ' + key + '=' + counts[key]);
  });
  return parts.join('/');
}

function summarizeLayerChanges(changes) {
  var counts = countFields(changes, ['data', 'shapes', 'meta']);
  var added = changes.filter(function(change) { return change.status == 'added'; }).length;
  var removed = changes.filter(function(change) { return change.status == 'removed'; }).length;
  var parts = [];
  if (added) parts.push('layers added=' + added);
  if (removed) parts.push('layers removed=' + removed);
  Object.keys(counts).forEach(function(key) {
    if (counts[key]) parts.push('layers ' + key + '=' + counts[key]);
  });
  return parts.join('/');
}

function countFields(changes, fields) {
  var counts = {};
  fields.forEach(function(field) {
    counts[field] = changes.filter(function(change) {
      return change[field] === true;
    }).length;
  });
  return counts;
}

function commandLabel(cmd) {
  return '-' + cmd.name;
}

function usage() {
  var name = path.basename(fileURLToPath(import.meta.url));
  console.log('Usage: node --import ./test/_register.mjs scripts/' + name + ' [--out dir] [--include-import] [--keep-going] workflow.txt ...');
}
