/* @requires mapshaper-run-command, mapshaper-parse-commands, mapshaper-catalog */

// Parse command line args into commands and run them
// @argv Array of command line tokens or single string of commands
api.runCommands = function(argv, done) {
  var commands, last;
  try {
    if (Array.isArray(argv) && argv.length > 0 && argv[0].name) {
      // argv seems to contain parsed commands
      commands = argv;
    } else {
      commands = MapShaper.parseCommands(argv);
    }
    last = commands[commands.length-1];
    if (last && last.name == 'o') {
      // final output -- ok to modify dataset in-place during export, avoids
      //   having to copy entire dataset
      last.options.final = true;
    }
  } catch(e) {
    return done(e);
  }

  if (commands.length === 0) {
    return done(new APIError("No commands to run"));
  }

  MapShaper.runParsedCommands(commands, function(err, catalog) {
    done(err);
  });
};

// Current api:
// @commands  String containing command line arguments or array of parsed commands
// @input  Object containing file contents indexed by filename
// @done  Callback: function(<error>, <output>), where output is an object containing
//           output from -o command(s) indexed by filename
//
// <0.4 api (deprecated): see MapShaper.applyCommands_v1() below
//
api.applyCommands = function(commands, input, done) {
  if (utils.isString(input) || utils.isArray(input) || (input && input.type)) {
    // old (deprecated) api: input is the content of a CSV or JSON file
    return MapShaper.applyCommands_v1(commands, input, done);
  }
  cli.input = input;
  cli.output = {}; // tells cli to accumulate output instead of writing to file
  api.runCommands(commands, function(err) {
    var o = cli.output;
    delete cli.input;
    delete cli.output;
    done(err, o);
  });
};

// Apply a set of processing commands to the contents of an input file
// @argv Command line arguments, as string or array
// @done Callback: function(<error>, <output>)
MapShaper.applyCommands_v1 = function(argv, content, done) {
  MapShaper.processFileContent(argv, content, function(err, exports) {
    var output = null;
    if (!err) {
      output = exports.map(function(obj) {
        return obj.content;
      });
      if (output.length == 1) {
        output = output[0];
      }
    }
    done(err, output);
  });
};

MapShaper.testCommands = function(argv, done) {
  MapShaper.runParsedCommands(MapShaper.parseCommands(argv), function(err, catalog) {
    var target = catalog && catalog.getDefaultTarget();
    var output;
    if (!err && target) {
      // returns dataset for compatibility with versions < 0.4.0
      output = target.dataset;
    }
    done(err, output);
  });
};

// Capture output data instead of writing files (useful for testing)
// @tokens Command line arguments, as string or array
// @content (may be null) Contents of input data file
// @done: Callback function(<error>, <output>); <output> is an array of objects
//        with properties "content" and "filename"
MapShaper.processFileContent = function(tokens, content, done) {
  var catalog, dataset, commands, lastCmd, inOpts, output;
  try {
    commands = MapShaper.parseCommands(tokens);
    commands = MapShaper.runAndRemoveInfoCommands(commands);

    // if we're processing raw content, import it to a dataset object
    if (content) {
      // if first command is -i, use -i options for importing
      if (commands[0] && commands[0].name == 'i') {
        inOpts = commands.shift().options;
      } else {
        inOpts = {};
      }
      dataset = MapShaper.importFileContent(content, null, inOpts);
      catalog = new Catalog().addDataset(dataset);
    }

    // if last command is -o, use -o options for exporting
    lastCmd = commands[commands.length-1];
    if (!lastCmd || lastCmd.name != 'o') {
      lastCmd = {name: 'o', options: {}};
      commands.push(lastCmd);
    }
    // export to callback, not file
    lastCmd.options.callback = function(data) {
      output = data;
    };
  } catch(e) {
    return done(e);
  }

  MapShaper.runParsedCommands(commands, catalog, function(err) {
    done(err, output);
  });
};

// Execute a sequence of commands
// Signature: function(commands, [catalog,] done)
// @commands Array of parsed commands
// [@catalog]: Optional Catalog object containing data
// @done: function(<error>, <catalog>)
//
MapShaper.runParsedCommands = function(commands) {
  var catalog = new Catalog(),
      done;

  if (arguments.length == 2) {
    done = arguments[1];
  } else if (arguments.length == 3) {
    catalog = arguments[1];
    done = arguments[2];
    if (catalog && catalog instanceof Catalog === false) {
      error("Changed in v0.4: runParsedCommands() takes a Catalog object");
    }
  }

  if (!utils.isFunction(done)) {
    error("Missing a callback function");
  }

  if (!utils.isArray(commands)) {
    error("Expected an array of parsed commands");
  }

  commands = MapShaper.runAndRemoveInfoCommands(commands);
  commands = MapShaper.divideImportCommand(commands);

  if (commands.length === 0) {
    return done(null);
  }

  utils.reduceAsync(commands, catalog, function(catalog, cmd, nextCmd) {
    api.runCommand(cmd, catalog, nextCmd);
  }, done);
};

// If an initial import command indicates that several input files should be
//   processed separately, then duplicate the sequence of commands to run
//   once for each input file
// @commands Array of parsed commands
// Returns: either original command array or array of duplicated commands.
//
MapShaper.divideImportCommand = function(commands) {
  var firstCmd = commands[0],
      opts = firstCmd && firstCmd.options;
  if (!firstCmd || firstCmd.name != 'i' || opts.stdin || opts.merge_files ||
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

// Handle information commands and remove them from the list
MapShaper.runAndRemoveInfoCommands = function(commands) {
  return commands.filter(function(cmd) {
    if (cmd.name == 'version') {
      message(MapShaper.VERSION);
    } else if (cmd.name == 'encodings') {
      MapShaper.printEncodings();
    } else if (cmd.name == 'projections') {
      MapShaper.printProjections();
    } else if (cmd.name == 'help') {
      MapShaper.getOptionParser().printHelp(cmd.options.commands);
    } else if (cmd.name == 'verbose') {
      MapShaper.VERBOSE = true;
    } else if (cmd.name == 'quiet') {
      MapShaper.LOGGING = false;
    } else if (cmd.name == 'tracing') {
      MapShaper.TRACING = true;
    } else {
      return true;
    }
    return false;
  });
};
