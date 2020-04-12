import { runCommand } from '../cli/mapshaper-run-command';
import { printProjections } from '../geom/mapshaper-projections';
import { printEncodings } from '../text/mapshaper-encodings';
import { parseCommands } from '../cli/mapshaper-parse-commands';
import { guessInputContentType } from '../io/mapshaper-file-types';
import { error, UserError, message, print, loggingEnabled, printError } from '../utils/mapshaper-logging';
import { createAsyncContext } from '../mapshaper-state';
import { Catalog } from '../dataset/mapshaper-catalog';
import { setStateVar, runningInBrowser } from '../mapshaper-state';
import utils from '../utils/mapshaper-utils';


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
  var command = [process.execPath, '--max-old-space-size=' + mb, mapshaperScript, argv].join(' ');
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

  // add options to -i -o -join -clip -erase commands to bypass file i/o
  // TODO: find a less kludgy solution, e.g. storing input data using setStateVar()
  commands.forEach(function(cmd) {
    if (commandTakesFileInput(cmd.name) && inputObj) {
      cmd.options.input = inputObj;
    }
    if (cmd.name == 'o' && outputArr) {
      cmd.options.output = outputArr;
    }
  });
  runParsedCommands(commands, null, callback);
}

function commandTakesFileInput(name) {
  return (name == 'i' || name == 'join' || name == 'erase' || name == 'clip' || name == 'include');
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
  _runCommands(argv, {}, function(err, catalog) {
    var targets = catalog ? catalog.getDefaultTargets() : [];
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
// @catalog: Optional Catalog object containing previously imported data
// @cb: function(<error>, <catalog>)
//
export function runParsedCommands(commands, catalog, cb) {
  if (!catalog) {
    cb = createAsyncContext(cb); // use new context when creating new catalog
    catalog = new Catalog();
  } else if (catalog instanceof Catalog === false) {
    error("Changed in v0.4: runParsedCommands() takes a Catalog object");
  }

  if (!utils.isFunction(done)) {
    error("Missing a callback function");
  }

  if (!utils.isArray(commands)) {
    error("Expected an array of parsed commands");
  }

  if (commands.length === 0) {
    return done(new UserError("No commands to run"));
  }
  commands = readAndRemoveSettings(commands);
  if (!runningInBrowser()) {
    printStartupMessages();
  }
  commands = runAndRemoveInfoCommands(commands);
  if (commands.length === 0) {
    return done(null);
  }
  if (!runningInBrowser() && commands[commands.length-1].name == 'o') {
    // in CLI, set 'final' flag on final -o command, so the export function knows
    // that it can modify the output dataset in-place instead of making a copy.
    commands[commands.length-1].options.final = true;
  }
  commands = divideImportCommand(commands);
  utils.reduceAsync(commands, catalog, nextCommand, done);

  function nextCommand(catalog, cmd, next) {
    setStateVar('current_command', cmd.name); // for log msgs
    runCommand(cmd, catalog, next);
  }

  function done(err, catalog) {
    if (err) printError(err);
    cb(err, catalog);
    setStateVar('current_command', null);
  }
}

// If an initial import command indicates that several input files should be
//   processed separately, then duplicate the sequence of commands to run
//   once for each input file
// @commands Array of parsed commands
// Returns: either original command array or array of duplicated commands.
//
function divideImportCommand(commands) {
  var firstCmd = commands[0],
      opts = firstCmd.options;

  if (firstCmd.name != 'i' || opts.stdin || opts.merge_files ||
    opts.combine_files || !opts.files || opts.files.length < 2) {
    return commands;
  }

  return (opts.files).reduce(function(memo, file) {
    var importCmd = {
      name: 'i',
      options: utils.defaults({
        files:[file],
        replace: true  // kludge to replace data catalog
      }, opts)
    };
    memo.push(importCmd);
    memo.push.apply(memo, commands.slice(1));
    return memo;
  }, []);
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
function readAndRemoveSettings(commands) {
  return commands.filter(function(cmd) {
    if (cmd.name == 'verbose') {
      setStateVar('VERBOSE', true);
    } else if (cmd.name == 'quiet') {
      setStateVar('QUIET', true);
    } else if (cmd.name == 'debug') {
      setStateVar('DEBUG', true);
    } else {
      return true;
    }
    return false;
  });
}

// Run informational commands and remove them from the array of parsed commands
export function runAndRemoveInfoCommands(commands) {
  return commands.filter(function(cmd) {
    if (cmd.name == 'version') {
      print(typeof VERSION == 'undefined' ? '' : VERSION);
    } else if (cmd.name == 'encodings') {
      printEncodings();
    } else if (cmd.name == 'projections') {
      printProjections();
    } else {
      return true;
    }
    return false;
  });
}
