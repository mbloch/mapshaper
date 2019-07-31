/* @requires mapshaper-run-command, mapshaper-parse-commands, mapshaper-catalog */

// Parse command line args into commands and run them
// Function takes an optional Node-style callback. A Promise is returned if no callback is given.
//   function(argv[, input], callback)
//   function(argv[, input])  (returns Promise)
// argv: String or array containing command line args.
// input: (optional) Object containing file contents indexed by filename
//
api.runCommands = function(argv) {
  var opts = internal.importRunArgs(arguments);
  internal.runCommands(argv, opts, function(err) {
    opts.callback(err);
  });
  if (opts.promise) return opts.promise;
};

// Similar to runCommands(), but returns output files to the callback or Promise
//   instead of using file I/O.
// Callback signature: function(<error>, <data>) -- data is an object
//   containing output from any -o commands, indexed by filename.
//
api.applyCommands = function(argv) {
  var opts = internal.importRunArgs(arguments);
  var done = opts.callback;
  var outputArr = opts.output = []; // output gets added to this array
  internal.runCommands(argv, opts, function(err) {
    if (err) return done(err);
    if (opts.legacy) return done(null, internal.toLegacyOutputFormat(outputArr));
    return done(null, internal.toOutputFormat(outputArr));
  });
  if (opts.promise) return opts.promise;
};

// Parse the "arguments" object from runCommands() or applyCommands()
internal.importRunArgs = function(args) {
  var opts = {};
  if (utils.isFunction(args[1])) {
    opts.callback = args[1];
  } else if (utils.isFunction(args[2])) {
    opts.callback = args[2];
    opts.input = args[1];
    opts.legacy = opts.input && internal.guessInputContentType(opts.input) != null;
  } else {
    // New: if no callback, create a promise and a callback
    opts.input = args[1] || null;
    opts.promise = new Promise(function(resolve, reject) {
      opts.callback = function(err, data) {
        if (err) reject(err);
        else resolve(data);
      };
    });
  }
  return opts;
};

// Return an object containing content of zero or more output files, indexed by filename.
internal.toOutputFormat = function(arr) {
  return arr.reduce(function(memo, o) {
    memo[o.filename] = o.content;
    return memo;
  }, {});
};

// Unified function for processing calls to runCommands() and applyCommands()
internal.runCommands = function(argv, opts, callback) {
  var outputArr = opts.output || null,
      inputObj = opts.input,
      commands;
  try {
    commands = internal.parseCommands(argv);
  } catch(e) {
    return callback(e);
  }

  if (opts.legacy) {
    message("Warning: deprecated input format");
    commands = internal.convertLegacyCommands(commands, inputObj);
    inputObj = null;
  }

  // add options to -i -o -join -clip -erase commands to bypass file i/o
  // TODO: find a less kludgy solution, e.g. storing input data using setStateVar()
  commands.forEach(function(cmd) {
    if (internal.commandTakesFileInput(cmd.name) && inputObj) {
      cmd.options.input = inputObj;
    }
    if (cmd.name == 'o' && outputArr) {
      cmd.options.output = outputArr;
    }
  });
  internal.runParsedCommands(commands, null, callback);
};

internal.commandTakesFileInput = function(name) {
  return (name == 'i' || name == 'join' || name == 'erase' || name == 'clip' || name == 'include');
};

internal.toLegacyOutputFormat = function(arr) {
  if (arr.length > 1) {
    // Return an array if multiple files are output
    return utils.pluck(arr, 'content');
  }
  if (arr.length == 1) {
    // Return content if a single file is output
    return arr[0].content;
  }
  return null;
};

internal.convertLegacyCommands = function(arr, inputObj) {
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
};

// TODO: rewrite tests and remove this function
internal.testCommands = function(argv, done) {
  internal.runCommands(argv, {}, function(err, catalog) {
    var targets = catalog ? catalog.getDefaultTargets() : [];
    var output;
    if (!err && targets.length > 0) {
      // returns dataset for compatibility with some older tests
      output = targets[0].dataset;
    }
    done(err, output);
  });
};

// Execute a sequence of parsed commands
// @commands Array of parsed commands
// @catalog: Optional Catalog object containing previously imported data
// @cb: function(<error>, <catalog>)
//
internal.runParsedCommands = function(commands, catalog, cb) {
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
  commands = internal.runAndRemoveInfoCommands(commands);
  if (commands.length === 0) {
    return done(null);
  }
  if (!api.gui && commands[commands.length-1].name == 'o') {
    // in CLI, set 'final' flag on final -o command, so the export function knows
    // that it can modify the output dataset in-place instead of making a copy.
    commands[commands.length-1].options.final = true;
  }
  commands = internal.divideImportCommand(commands);
  utils.reduceAsync(commands, catalog, nextCommand, done);

  function nextCommand(catalog, cmd, next) {
    internal.setStateVar('current_command', cmd.name); // for log msgs
    api.runCommand(cmd, catalog, next);
  }

  function done(err, catalog) {
    cb(err, catalog);
    internal.setStateVar('current_command', null);
  }
};

// If an initial import command indicates that several input files should be
//   processed separately, then duplicate the sequence of commands to run
//   once for each input file
// @commands Array of parsed commands
// Returns: either original command array or array of duplicated commands.
//
internal.divideImportCommand = function(commands) {
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
};

// Call @iter on each member of an array (similar to Array#reduce(iter))
//    iter: function(memo, item, callback)
// Call @done when all members have been processed or if an error occurs
//    done: function(err, memo)
// @memo: Initial value
//
utils.reduceAsync = function(arr, memo, iter, done) {
  var call = typeof setImmediate == 'undefined' ? setTimeout : setImmediate;
  var i=0;
  next(null, memo);

  function next(err, memo) {
    // Detach next operation from call stack to prevent overflow
    // Don't use setTimeout(, 0) if setImmediate is available
    // (setTimeout() can introduce a long delay if previous operation was slow,
    //    as of Node 0.10.32 -- a bug?)
    if (err) {
      return done(err, null);
    }
    call(function() {
      if (i < arr.length === false) {
        done(null, memo);
      } else {
        iter(memo, arr[i++], next);
      }
    }, 0);
  }
};

// Run informational commands and remove them from the array of parsed commands
internal.runAndRemoveInfoCommands = function(commands) {
  return commands.filter(function(cmd) {
    if (cmd.name == 'version') {
      message(internal.VERSION);
    } else if (cmd.name == 'encodings') {
      internal.printEncodings();
    } else if (cmd.name == 'projections') {
      internal.printProjections();
    } else if (cmd.name == 'verbose') {
      internal.setStateVar('VERBOSE', true);
    } else if (cmd.name == 'quiet') {
      internal.setStateVar('QUIET', true);
    } else if (cmd.name == 'debug') {
      internal.setStateVar('DEBUG', true);
    } else {
      return true;
    }
    return false;
  });
};
