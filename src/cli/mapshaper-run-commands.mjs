import { runCommand } from '../cli/mapshaper-run-command';
import { printProjections } from '../crs/mapshaper-projections';
import { printEncodings } from '../text/mapshaper-encodings';
import { printColorSchemeNames } from '../color/color-schemes';
import { parseCommands } from '../cli/mapshaper-parse-commands';
import { containsPlaceholder, interpolateString } from '../cli/mapshaper-vars-utils';
import { skipCommand } from '../commands/mapshaper-if-elif-else-endif';
import { guessInputContentType } from '../io/mapshaper-file-types';
import { error, UserError, stop, message, print, loggingEnabled, printError } from '../utils/mapshaper-logging';
import { Job } from '../mapshaper-job';
import { runningInBrowser } from '../mapshaper-env';
import utils from '../utils/mapshaper-utils';
import require from '../mapshaper-require';
import { commandTakesFileInput } from '../cli/mapshaper-command-info';
import { inControlBlock } from '../mapshaper-control-flow';
import { version } from '../../package.json';

// Parse command line args into commands and run them
// Function takes an optional Node-style callback. A Promise is returned if no callback is given.
//   function(argv[, input], callback)
//   function(argv[, input]) (returns Promise)
// argv: String or array containing command line args.
// input: (optional) Object containing file contents indexed by filename
//
export function runCommands(argv) {
  var opts = importRunArgs.apply(null, arguments);
  _runCommands(argv, opts, function(err) {
    opts.callback(err);
  });
  if (opts.promise) return opts.promise;
}

// Similar to runCommands(), but returns output files to the callback or Promise
//   instead of using file I/O.
// Callback signature: function(<error>, <data>) -- data is an object
//   containing output from any -o commands, indexed by filename.
//
export function applyCommands(argv) {
  var opts = importRunArgs.apply(null, arguments);
  var callback = opts.callback;
  var outputArr = opts.output = []; // output gets added to this array
  _runCommands(argv, opts, function(err) {
    if (err) {
      return callback(err);
    }
    if (opts.legacy) return callback(null, toLegacyOutputFormat(outputArr));
    return callback(null, toOutputFormat(outputArr));
  });
  if (opts.promise) return opts.promise;
}

// Run commands with extra heap memory
//   function(argv[, options], callback)
//   function(argv[, options]) (returns Promise)
// options: (optional) object with "xl" property, e.g. {xl: "16gb"}
//
export function runCommandsXL(argv) {
  var opts = importRunArgs.apply(null, arguments);
  var mapshaperScript = require('path').join(__dirname, 'bin/mapshaper');
  var gb = parseFloat(opts.options.xl) || 8;
  var err;
  if (gb < 1 || gb > 64) {
    err = new Error('Unsupported heap size:' + gb + 'GB');
    printError(err);
    opts.callback(err);
    return opts.promise; // may be undefined
  }
  if (!loggingEnabled()) argv += ' -quiet'; // kludge to pass logging setting to subprocess
  var mb = Math.round(gb * 1000);
  var command = [`"${process.execPath}"`, '--max-old-space-size=' + mb, `"${mapshaperScript}"`, argv].join(' ');
  var child = require('child_process').exec(command, {}, function(err, stdout, stderr) {
    opts.callback(err);
  });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  if (opts.promise) return opts.promise;
}

// Parse the arguments from runCommands() or applyCommands()
function importRunArgs(arg0, arg1, arg2) {
  var opts = {options: {}};
  if (utils.isFunction(arg1)) {
    opts.callback = arg1;
  } else if (utils.isFunction(arg2)) {
    opts.callback = arg2;
    // identify legacy input format (used by some tests)
    opts.legacy = arg1 && guessInputContentType(arg1) != null;
    opts.input = arg1;
  } else {
    // if no callback, create a promise and a callback for resolving the promise
    opts.promise = new Promise(function(resolve, reject) {
      opts.callback = function(err, data) {
        if (err) reject(err);
        else resolve(data);
      };
    });
  }
  if (!opts.legacy && utils.isObject(arg1)) {
    if (arg1.xl) {
      // options for runCommandsXL()
      opts.options = arg1;
    } else {
      // input data for runCommands() and applyCommands()
      opts.input = arg1;
    }
  }
  return opts;
}

// Return an object containing content of zero or more output files, indexed by filename.
function toOutputFormat(arr) {
  return arr.reduce(function(memo, o) {
    memo[o.filename] = o.content;
    return memo;
  }, {});
}

// Unified function for processing calls to runCommands() and applyCommands()
function _runCommands(argv, opts, callback) {
  var outputArr = opts.output || null,
      inputObj = opts.input,
      commands;
  try {
    commands = parseCommands(argv);

  } catch(e) {
    printError(e);
    return callback(e);
  }

  if (opts.legacy) {
    message("Warning: deprecated input format");
    commands = convertLegacyCommands(commands, inputObj);
    inputObj = null;
  }

  if (commands.length === 0) {
    return callback(new UserError("No commands to run"));
  }

  commands = runAndRemoveInfoCommands(commands);
  if (commands.length === 0) return done(null);

  // add options to -i -o -join -clip -erase etc. commands to bypass file i/o
  // TODO: find a less kludgy solution
  commands.forEach(function(cmd) {
    if (commandTakesFileInput(cmd.name) && inputObj) {
      cmd.options.input = inputObj;
    }
    if (outputArr && (cmd.name == 'o' || cmd.name == 'info' && cmd.options.save_to)) {
      cmd.options.output = outputArr;
    }
    // -run may load and execute a command file; propagate the output array
    // so that -o commands nested inside it can write to it too.
    if (outputArr && cmd.name == 'run') {
      cmd.options.output = outputArr;
    }
  });

  var lastCmd = commands[commands.length - 1];
  if (!runningInBrowser() && lastCmd.name == 'o') {
    // in CLI, set 'final' flag on final -o command, so the export function knows
    // that it can modify the output dataset in-place instead of making a copy.
    lastCmd.options.final = true;
  }

  var batches = divideImportCommand(commands);
  utils.reduceAsync(batches, null, nextGroup, done);

  function nextGroup(prevJob, commands, next) {
    runParsedCommands(commands, new Job(), function(err, job) {
      err = handleNonFatalError(err);
      next(err, job);
    });
  }

  function done(err, job) {
    if (job && inControlBlock(job)) {
      message('Warning: -if command is missing a matching -endif');
    }
    err = handleNonFatalError(err);
    if (err) printError(err);
    callback(err, job);
  }
}


function toLegacyOutputFormat(arr) {
  if (arr.length > 1) {
    // Return an array if multiple files are output
    return utils.pluck(arr, 'content');
  }
  if (arr.length == 1) {
    // Return content if a single file is output
    return arr[0].content;
  }
  return null;
}

function convertLegacyCommands(arr, inputObj) {
  var i = utils.find(arr, function(cmd) {return cmd.name == 'i';});
  var o = utils.find(arr, function(cmd) {return cmd.name == 'o';});
  if (!i) {
    i = {name: 'i', options: {}};
    arr.unshift(i);
  }
  i.options.files = ['__input__'];
  i.options.input = {__input__: inputObj};
  if (!o) {
    arr.push({name: 'o', options: {}});
  }
  return arr;
}

// TODO: rewrite tests and remove this function
export function testCommands(argv, done) {
  _runCommands(argv, {}, function(err, job) {
    var targets = job ? job.catalog.getDefaultTargets() : [];
    var output;
    if (!err && targets.length > 0) {
      // returns dataset for compatibility with some older tests
      output = targets[0].dataset;
    }
    done(err, output);
  });
}


// Execute a sequence of parsed commands
// @commands Array of parsed commands
// @job: Job object containing previously imported data
// @done: function([error], [job])
//
export function runParsedCommands(commands, job, done) {
  if (!job) job = new Job();
  commands = readAndRemoveSettings(job, commands);
  if (!runningInBrowser()) {
    printStartupMessages();
  }
  commands = runAndRemoveInfoCommands(commands);
  if (commands.length === 0) {
    return done(null);
  }
  // we're no longer using the same Job for all batches -- no reset needed
  // // resetting closes any unterminated -if blocks from a previous command sequence
  // resetControlFlow(job);
  utils.reduceAsync(commands, job, nextCommand, done);

  function nextCommand(job, cmd, next) {
    var resolved;
    try {
      resolved = maybeInterpolateCommand(cmd, job);
    } catch(e) {
      return next(e);
    }
    runCommand(resolved, job).then(function(result) {
      next(null, result);
    }).catch(function(e) {
      next(e);
    });
  }
}

// Late-binding interpolation: just before each command runs, replace any
// {{X}} placeholders in its source tokens against the live job.defs object,
// then re-parse to get fresh option values.
//
// Returns either the original cmd (no placeholders, no _tokens, or the
// command will be skipped) or a fresh cmd object with re-parsed options.
// The original cmd is never mutated, so commands shared across batches
// (see divideImportCommand) still see their un-interpolated tokens.
function maybeInterpolateCommand(cmd, job) {
  var tokens = cmd._tokens;
  if (!tokens || tokens.length === 0) return cmd;
  if (!tokens.some(containsPlaceholder)) return cmd;
  // If the command would be skipped (inactive -if branch, stopped job, etc.),
  // don't try to interpolate -- the command body never runs and unset
  // variables shouldn't error here.
  if (skipCommand(cmd.name, job)) return cmd;

  var defs = job.defs || {};
  var interpolated;
  try {
    interpolated = tokens.map(function(tok) {
      return interpolateString(tok, defs);
    });
  } catch(e) {
    e.message = '[' + cmd.name + '] ' + e.message;
    throw e;
  }

  var reparsed;
  try {
    reparsed = parseCommands(interpolated);
  } catch(e) {
    e.message = '[' + cmd.name + '] ' + e.message;
    throw e;
  }
  if (reparsed.length !== 1) {
    stop('[' + cmd.name + '] Internal error: token re-parse produced ' +
      reparsed.length + ' commands');
  }
  var newCmd = reparsed[0];
  // Preserve externally-injected options (input cache, output array,
  // _run_depth, final flag, replace flag, etc.) that aren't reproduced
  // by re-parsing the source tokens.
  Object.keys(cmd.options).forEach(function(k) {
    if (!(k in newCmd.options)) {
      newCmd.options[k] = cmd.options[k];
    }
  });
  // Keep the original tokens around so re-runs (e.g. divided import batches)
  // see the un-interpolated source.
  newCmd._tokens = tokens;
  return newCmd;
}

function handleNonFatalError(err) {
  if (err && err.name == 'NonFatalError') {
    printError(err);
    return null;
  }
  return err;
}

// If an initial import command indicates that several input files should be
//   processed separately, then duplicate the sequence of commands to run
//   once for each input file
// @commands Array of parsed commands
// Returns: Array of one or more sequences of parsed commands
//
function divideImportCommand(commands) {
  var firstCmd = commands[0],
      opts = firstCmd.options;

  if (firstCmd.name != 'i' || opts.stdin || opts.merge_files ||
    opts.combine_files || !opts.files || opts.files.length < 2) {
    return [commands];
  }

  // Multiple files trigger batch mode by default. This is a long-standing
  // wart: most multi-file CLI tools combine inputs by default, and silently
  // splitting into per-file pipelines is an easy way for users to get wrong
  // output without noticing. Print a one-time deprecation warning when batch
  // mode is implicit so existing scripts can migrate before the default flips
  // in a future major release.
  if (!opts.batch_mode) {
    message('Note: implicit batch processing is deprecated. Add `batch-mode` ' +
      'to keep this behavior, or `combine-files` to import the files as a ' +
      'group of layers. The default will change in a future release.');
  }

  return opts.files.map(function(file) {
    var group = [{
      name: 'i',
      options: utils.defaults({
        files:[file],
        replace: true  // kludge to replace data catalog
      }, opts)
    }];
    group.push.apply(group, commands.slice(1));
    return group;
  });
}


function printStartupMessages() {
  // print heap memory message if running with a custom amount
  var rxp = /^--max-old-space-size=([0-9]+)$/;
  var arg = process.execArgv.find(function(s) {
    return rxp.test(s);
  });
  if (arg) {
    message('Allocating', rxp.exec(arg)[1] / 1000, 'GB of heap memory');
  }
}

// Some settings use command syntax and are parsed as commands.
function readAndRemoveSettings(job, commands) {
  var settings = {VERBOSE: false, QUIET: false, DEBUG: false};
  var filtered = commands.filter(function(cmd) {
    if (cmd.name == 'verbose') {
      settings.VERBOSE = true;
    } else if (cmd.name == 'quiet') {
      settings.QUIET = true;
    } else if (cmd.name == 'debug') {
      settings.DEBUG = true;
    } else {
      return true;
    }
    return false;
  });
  job.initSettings(settings);
  return filtered;
}

// Run informational commands and remove them from the array of parsed commands
export function runAndRemoveInfoCommands(commands) {
  return commands.filter(function(cmd) {
    if (cmd.name == 'version') {
      print(version);
    } else if (cmd.name == 'encodings') {
      printEncodings();
    } else if (cmd.name == 'colors') {
      printColorSchemeNames();
    } else if (cmd.name == 'projections') {
      printProjections();
    } else {
      return true;
    }
    return false;
  });
}
