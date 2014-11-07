/* @requires mapshaper-run-command, mapshaper-options */

// parse command line args into commands and run them
api.runShellArgs = function(argv, done) {
  var commands;
  try {
    commands = MapShaper.parseCommands(argv);
  } catch(e) {
    return done(e);
  }
  if (commands.length === 0) {
    return done(new APIError("Missing an input file"));
  }

  // if there's a -i command, no -o command and no -info command,
  // append a generic -o command.
  if (!utils.some(commands, function(cmd) { return cmd.name == 'o'; }) &&
      !utils.some(commands, function(cmd) { return cmd.name == 'info'; }) &&
      utils.some(commands, function(cmd) {return cmd.name == 'i'; })) {
    commands.push({name: "o", options: {}});
  }

  T.start("Start timing");
  api.runCommands(commands, function(err, dataset) {
    T.stop("Total time");
    done(err);
  });
};

// @tokens Command line arguments
// @content GeoJSON or TopoJSON as string or object
api.applyCommands = function(tokens, content, done) {
  var dataset, commands, cmd, inOpts, outOpts;
  try {
    commands = MapShaper.parseCommands(tokens);

    // ensure that first command is -i
    cmd = commands[0];
    if (cmd && cmd.name == 'i') {
      inOpts = commands.pop().options;
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

    dataset = MapShaper.importFileContent(content, 'json', inOpts);
  } catch(e) {
    return done(e);
  }
  api.runCommands(commands, dataset, exportDataset);

  function exportDataset(err, dataset) {
    var output = null;
    if (!err) {
      var exports = MapShaper.exportFileContent(dataset, outOpts),
          outFmt = outOpts.format;
      if (outFmt != 'geojson' && outFmt != 'topojson') {
        err = new APIError("[applyCommands()] Expected JSON export; received: " + outFmt);
      } else {
        // return JSON dataset(s) as strings or objects (according to input format)
        output = exports.map(function(obj) {
          return utils.isString(content) ? obj.content : JSON.parse(obj.content);
        });
        if (output.length == 1) {
          output = output[0];
        }
      }
    }

    done(err, output);
  }
};

// Execute a sequence of commands
// Signature: function(commands, [dataset,] done)
// @commands either a string of commands or an array of parsed commands
//
api.runCommands = function(commands) {
  var dataset = null,
      done, args;

  if (arguments.length == 2) {
    done = arguments[1];
  } else if (arguments.length == 3) {
    dataset = arguments[1];
    done = arguments[2];
  }

  if (!utils.isFunction(done)) {
    stop("[runCommands()] Missing a callback function");
  }

  if (utils.isString(commands)) {
    try {
      commands = MapShaper.parseCommands(commands);
    } catch(e) {
      return done(e);
    }
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

MapShaper.divideImportCommand = function(commands) {
  var firstCmd = commands[0],
      opts = firstCmd.options,
      files = opts.files || [];

  if (firstCmd.name != 'i' || files.length <= 1 || opts.stdin || opts.merge_files || opts.combine_files) {
    return commands;
  }
  return files.reduce(function(memo, file) {
    var importCmd = {
      name: 'i',
      options: Utils.defaults({files:[file]}, opts)
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
  return Utils.filter(commands, function(cmd) {
    if (cmd.name == 'version') {
      console.error(getVersion());
    } else if (cmd.name == 'encodings') {
      MapShaper.printEncodings();
    } else if (cmd.name == 'help') {
      MapShaper.printHelp(cmd.options.commands);
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

MapShaper.printHelp = function(commands) {
  MapShaper.getOptionParser().printHelp(commands);
};

MapShaper.validateJSON = function(json) {
  // TODO: remove duplication with mapshaper-import.js
  if (content.type == 'Topology') {
    fmt = 'topojson';
  } else if (content.type) {
    fmt = 'geojson';
  } else {
    return done(new APIError("[applyCommands()] Content must be TopoJSON or GeoJSON"));
  }
};
