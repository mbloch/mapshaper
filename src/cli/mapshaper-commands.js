/* @requires mapshaper-run-command, mapshaper-options */

// Parse command line args into commands and run them
// @argv Array of command line tokens or single string of commands
api.runCommands = function(argv, done) {
  var commands;
  try {
    commands = MapShaper.parseCommands(argv);
  } catch(e) {
    return done(e);
  }

  if (commands.length === 0) {
    return done(new APIError("No commands to run"));
  }

  T.start("Start timing");
  MapShaper.runParsedCommands(commands, function(err, output) {
    T.stop("Total time");
    done(err, output);
  });
};

// Apply a set of processing commands to the contents of an input file
// @argv Command line arguments, as string or array
// @done Callback: function(<error>, <output>)
api.applyCommands = function(argv, content, done) {
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

// @tokens Command line arguments, as string or array
// @content Contents of input data file
// @done: Callback function(<error>, <output>); <output> is an array of objects
//        with properties "content" and "filename"
MapShaper.processFileContent = function(tokens, content, done) {
  var dataset, commands, cmd, inOpts, outOpts;
  try {
    commands = MapShaper.parseCommands(tokens);

    // ensure that first command is -i
    cmd = commands[0];
    if (cmd && cmd.name == 'i') {
      inOpts = commands.shift().options;
    } else {
      inOpts = {};
    }

    // get an output command
    cmd = commands[commands.length-1];
    if (cmd && cmd.name == 'o') {
      outOpts = commands.pop().options;
    } else {
      outOpts = {};
    }
    dataset = MapShaper.importFileContent(content, null, inOpts);
  } catch(e) {
    return done(e);
  }

  MapShaper.runParsedCommands(commands, dataset, function(err, dataset) {
    var exports = null;
    if (!err) {
      try {
        exports = MapShaper.exportFileContent(dataset, outOpts);
      } catch(e) {
        err = e;
      }
    }
    done(err, exports);
  });
};

// Execute a sequence of commands
// Signature: function(commands, [dataset,] done)
// @commands Array of parsed commands
// @done: function(<error>, <dataset>)
//
MapShaper.runParsedCommands = function(commands) {
  var dataset = null,
      done;

  if (arguments.length == 2) {
    done = arguments[1];
  } else if (arguments.length == 3) {
    dataset = arguments[1];
    done = arguments[2];
  }

  if (!utils.isFunction(done)) {
    error("[runParsedCommands()] Missing a callback function");
  }

  if (!utils.isArray(commands)) {
    error("[runParsedCommands()] Expected an array of parsed commands");
  }

  commands = MapShaper.runAndRemoveInfoCommands(commands);
  if (commands.length === 0) {
    return done(null, dataset);
  }
  commands = MapShaper.divideImportCommand(commands);
  if (commands[0].name != 'i' && !dataset) {
    return done(new APIError("Missing a -i command"));
  }

  utils.reduceAsync(commands, dataset, function(dataset, cmd, nextCmd) {
    api.runCommand(cmd, dataset, nextCmd);
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
      firstOpts = firstCmd.options,
      files = firstOpts.files || [];

  if (firstCmd.name != 'i' || files.length <= 1 || firstOpts.stdin ||
      firstOpts.merge_files || firstOpts.combine_files) {
    return commands;
  }
  return files.reduce(function(memo, file) {
    var importCmd = {
      name: 'i',
      options: utils.defaults({files:[file]}, firstOpts)
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
  var i=0;
  next(null, memo);

  function next(err, memo) {
    // Detach next operation from call stack to prevent overflow
    // Don't use setTimeout(, 0) -- this can introduce a long delay if
    //   previous operation was slow, as of Node 0.10.32
    setImmediate(function() {
      if (err) {
        done(err, null);
      } else if (i < arr.length === false) {
        done(null, memo);
      } else {
        iter(memo, arr[i++], next);
      }
    });
  }
};

// Handle information commands and remove them from the list
MapShaper.runAndRemoveInfoCommands = function(commands) {
  return utils.filter(commands, function(cmd) {
    if (cmd.name == 'version') {
      message(getVersion());
    } else if (cmd.name == 'encodings') {
      MapShaper.printEncodings();
    } else if (cmd.name == 'projections') {
      MapShaper.printProjections();
    } else if (cmd.name == 'help') {
      MapShaper.getOptionParser().printHelp(cmd.options.commands);
    } else if (cmd.name == 'verbose') {
      MapShaper.VERBOSE = true;
    } else if (cmd.name == 'tracing') {
      MapShaper.TRACING = true;
    } else {
      return true;
    }
    return false;
  });
};
