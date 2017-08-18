/* @requires mapshaper-run-command, mapshaper-parse-commands, mapshaper-catalog */

// Parse command line args into commands and run them
// @argv String or array of command line args, or array of parsed commands
api.runCommands = function(argv, done) {
  var commands;
  try {
    commands = internal.parseCommands(argv);
  } catch(e) {
    return done(e);
  }
  internal.runParsedCommands(commands, null, function(err, catalog) {
    done(err);
  });
};

// Similar to runCommands(), but receives input files from an object and
// returns output files to a callback, instead of using file I/O.
//
// @commands  String or array of command line args, or array of parsed commands
// @input  Object containing file contents indexed by filename
// @done  Callback: function(<error>, <output>), where output is an object
//           containing output from -o command(s) indexed by filename
//
api.applyCommands = function(commands, input, done) {
  var output = [],
      type = internal.guessInputContentType(input);

  try {
    commands = internal.parseCommands(commands);
  } catch(e) {
    return done(e);
  }
  if (type == 'text' || type == 'json') {
    // old api: input is the content of a CSV or JSON file
    // return done(new UserError('applyCommands() has changed, see v0.4 docs'));
    message("Warning: applyCommands() was called with deprecated input format");
    return internal.applyCommandsOld(commands, input, done);
  }
  // add options to -i -o -join -clip -erase commands to bypass file i/o
  // TODO: find a less kludgy solution
  commands = commands.map(function(cmd) {
    var name = cmd.name;
    if ((name == 'i' || name == 'join' || name == 'erase' || name == 'clip') && input) {
      cmd.options.input = input;
    } else if (name == 'o') {
      cmd.options.output = output;
    }
    return cmd;
  });

  internal.runParsedCommands(commands, null, function(err) {
    var data = output.reduce(function(memo, o) {
        memo[o.filename] = o.content;
        return memo;
      }, {});
    done(err, err ? null : data);
  });
};

// TODO: rewrite applyCommands() tests and remove this function
// @commands array of parsed commands
// @content a JSON or CSV dataset
// @done callback: function(err, <data>) where <data> is the content of a
//     single output file or an array if multiple files are output
//
internal.applyCommandsOld = function(commands, content, done) {
  var output = [], lastCmd;
  commands = internal.runAndRemoveInfoCommands(commands);
  if (commands.length === 0 || commands[0].name != 'i') {
    commands.unshift({name: 'i', options: {}});
  }
  commands[0].options.input = {input: content};
  commands[0].options.files = ['input'];
  lastCmd = commands.pop();
  if (lastCmd.name != 'o') {
    commands.push(lastCmd);
    lastCmd = {name: 'o', options: {}};
  }
  commands.push(lastCmd);
  lastCmd.options.output = output;
  internal.runParsedCommands(commands, null, function(err) {
    var data = output.map(function(o) {return o.content;});
    if (data.length == 1) {
      data = data[0];
    }
    done(err, data);
  });
};

// TODO: rewrite tests and remove this function
internal.testCommands = function(argv, done) {
  internal.runParsedCommands(internal.parseCommands(argv), null, function(err, catalog) {
    var target = catalog && catalog.getDefaultTarget();
    var output;
    if (!err && target) {
      // returns dataset for compatibility with some older tests
      output = target.dataset;
    }
    done(err, output);
  });
};

// Execute a sequence of commands
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
      lastCmd = commands[commands.length-1],
      opts = firstCmd.options;

  if (lastCmd.name == 'o') {
    // final output -- ok to modify dataset in-place during export, avoids
    //   having to copy entire dataset
    lastCmd.options.final = true;
  }

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

// Handle information commands and remove them from the list
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
