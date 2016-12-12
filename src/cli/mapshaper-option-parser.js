/* @requires mapshaper-common */

function CommandParser() {
  var commandRxp = /^--?([a-z][\w-]*)$/i,
      assignmentRxp = /^([a-z0-9_+-]+)=(?!\=)(.*)$/i, // exclude ==
      _usage = "",
      _examples = [],
      _commands = [],
      _default = null,
      _note;

  if (this instanceof CommandParser === false) return new CommandParser();

  this.usage = function(str) {
    _usage = str;
    return this;
  };

  this.note = function(str) {
    _note = str;
    return this;
  };

  // set a default command; applies to command line args preceding the first
  // explicit command
  this.default = function(str) {
    _default = str;
  };

  this.example = function(str) {
    _examples.push(str);
  };

  this.command = function(name) {
    var opts = new CommandOptions(name);
    _commands.push(opts);
    return opts;
  };

  this.parseArgv = function(raw) {
    var commandDefs = getCommands(),
        commands = [], cmd,
        argv = MapShaper.cleanArgv(raw),
        cmdName, cmdDef, opt;

    if (argv.length == 1 && tokenIsCommandName(argv[0])) {
      // show help if only a command name is given
      argv.unshift('-help'); // kludge (assumes -help <command> syntax)
    } else if (argv.length > 0 && !tokenLooksLikeCommand(argv[0]) && _default) {
      // if there are arguments before the first explicit command, use the default command
      argv.unshift('-' + _default);
    }

    while (argv.length > 0) {
      cmdName = readCommandName(argv);
      if (!cmdName) {
        stop("Invalid command:", argv[0]);
      }
      cmdDef = findCommandDefn(cmdName, commandDefs);
      if (!cmdDef) {
        stop("Unknown command:", cmdName);
      }
      cmd = {
        name: cmdDef.name,
        options: {},
        _: []
      };

      while (argv.length > 0 && !tokenLooksLikeCommand(argv[0])) {
        readOption(cmd, argv, cmdDef);
      }

      if (cmdDef.validate) {
        try {
          cmdDef.validate(cmd);
        } catch(e) {
          stop("[" + cmdName + "] " + e.message);
        }
      }
      commands.push(cmd);
    }
    return commands;

    function tokenIsCommandName(s) {
      return !!utils.find(getCommands(), function(cmd) {
        return s === cmd.name || s === cmd.alias;
      });
    }

    function tokenLooksLikeCommand(s) {
      return commandRxp.test(s);
    }

    // Try to parse an assignment @token for command @cmdDef
    function parseAssignment(cmd, token, cmdDef) {
      var match = assignmentRxp.exec(token),
          name = match[1],
          val = utils.trimQuotes(match[2]),
          optDef = findOptionDefn(name, cmdDef);

      if (!optDef) {
        // Assignment to an unrecognized identifier could be an expression
        // (e.g. -each 'id=$.id') -- save for later parsing
        cmd._.push(token);
      } else if (optDef.type == 'flag' || optDef.assign_to) {
        stop("-" + cmdDef.name + " " + name + " option doesn't take a value");
      } else {
        readOption(cmd, [name, val], cmdDef);
      }
    }

    // Try to read an option for command @cmdDef from @argv
    function readOption(cmd, argv, cmdDef) {
      var token = argv.shift(),
          optDef = findOptionDefn(token, cmdDef),
          optName;

      if (assignmentRxp.test(token)) {
        parseAssignment(cmd, token, cmdDef);
        return;
      }

      if (!optDef) {
        // not a defined option; add it to _ array for later processing
        cmd._.push(token);
        return;
      }

      optName = optDef.alias_to || optDef.name;
      optName = optName.replace(/-/g, '_');

      if (optDef.assign_to) {
        cmd.options[optDef.assign_to] = optDef.name;
      } else if (optDef.type == 'flag') {
        cmd.options[optName] = true;
      } else {
        cmd.options[optName] = readOptionValue(argv, optDef);
      }
    }



    // Read an option value for @optDef from @argv
    function readOptionValue(argv, optDef) {
      var type = optDef.type,
          val, err, token;
      if (argv.length === 0 || tokenLooksLikeCommand(argv[0])) {
        err = 'Missing value';
      } else {
        token = argv.shift(); // remove token from argv
        if (type == 'number') {
          val = Number(token);
        } else if (type == 'integer') {
          val = Math.round(Number(token));
        } else if (type == 'comma-sep') {
          val = token.split(',');
        } else if (type == 'bbox') {
          val = token.split(',').map(parseFloat);
        } else if (type == 'percent') {
          val = utils.parsePercent(token);
        } else {
          val = token; // assumes string
        }

        if (val !== val) {
          err = "Invalid numeric value";
        }
      }

      if (err) {
        stop(err + " for option " + optDef.name + "=<value>");
      }
      return val;
    }

    // Check first element of an array of tokens; remove and return if it looks
    // like a command name, else return null;
    function readCommandName(args) {
      var match = commandRxp.exec(args[0]);
      if (match) {
        args.shift();
        return match[1];
      }
      return null;
    }

    function findCommandDefn(name, arr) {
      return utils.find(arr, function(cmd) {
        return cmd.name === name || cmd.alias === name;
      });
    }

    function findOptionDefn(name, cmd) {
      return utils.find(cmd.options, function(o) {
        return o.name === name || o.alias === name;
      });
    }
  };

  this.getHelpMessage = function(commandNames) {
    var helpStr = '',
        cmdPre = '  ',
        optPre = '  ',
        exPre = '  ',
        gutter = '  ',
        colWidth = 0,
        detailView = false,
        helpCommands, allCommands;

    allCommands = getCommands().filter(function(cmd) {
      // hide commands without a description
      return !!cmd.describe;
    });

    if (commandNames) {
      detailView = true;
      helpCommands = commandNames.reduce(function(memo, name) {
        var cmd = utils.find(allCommands, function(cmd) {return cmd.name == name;});
        if (cmd) memo.push(cmd);
        return memo;
      }, []);

      allCommands.filter(function(cmd) {
        return utils.contains(commandNames, cmd.name);
      });
      if (helpCommands.length === 0) {
        detailView = false;
      }
    }

    if (!detailView) {
      if (_usage) {
        helpStr +=  "\n" + _usage + "\n\n";
      }
      helpCommands = allCommands;
    }

    // Format help strings, calc width of left column.
    colWidth = helpCommands.reduce(function(w, obj) {
      var help = cmdPre + (obj.name ? "-" + obj.name : "");
      if (obj.alias) help += ", -" + obj.alias;
      obj.help = help;
      if (detailView) {
        w = obj.options.reduce(function(w, opt) {
          if (opt.describe) {
            w = Math.max(formatOption(opt), w);
          }
          return w;
        }, w);
      }
      return Math.max(w, help.length);
    }, 0);

    // Layout help display
    helpCommands.forEach(function(cmd) {
      if (!detailView && cmd.title) {
        helpStr += cmd.title + "\n";
      }
      if (detailView) {
        helpStr += '\nCommand\n';
      }
      helpStr += formatHelpLine(cmd.help, cmd.describe);
      if (detailView && cmd.options.length > 0) {
        helpStr += '\nOptions\n';
        cmd.options.forEach(function(opt) {
          if (opt.help && opt.describe) {
            helpStr += formatHelpLine(opt.help, opt.describe);
          }
        });
      }
      if (detailView && cmd.examples) {
        helpStr += '\nExample' + (cmd.examples.length > 1 ? 's' : ''); //  + '\n';
        cmd.examples.forEach(function(ex) {
          ex.split('\n').forEach(function(line) {
            helpStr += '\n' + exPre + line;
          });
          helpStr += '\n';
        });
      }
    });

    // additional notes for non-detail view
    if (!detailView) {
      if (_examples.length > 0) {
        helpStr += "\nExamples\n";
        _examples.forEach(function(str) {
          helpStr += "\n" + str + "\n";
        });
      }
      if (_note) {
        helpStr += '\n' + _note;
      }
    }

    return helpStr;

    function formatHelpLine(help, desc) {
      return utils.rpad(help, colWidth, ' ') + gutter + (desc || '') + '\n';
    }

    function formatOption(o) {
      o.help = optPre;
      if (o.label) {
        o.help += o.label;
      } else {
        o.help += o.name;
        if (o.alias) o.help += ", " + o.alias;
        if (o.type != 'flag' && !o.assign_to) o.help += "=";
      }
      return o.help.length;
    }

  };

  this.printHelp = function(commands) {
    message(this.getHelpMessage(commands));
  };

  function getCommands() {
    return _commands.map(function(cmd) {
      return cmd.done();
    });
  }
}

function CommandOptions(name) {
  var _command = {
    name: name,
    options: []
  };

  this.validate = function(f) {
    _command.validate = f;
    return this;
  };

  this.describe = function(str) {
    _command.describe = str;
    return this;
  };

  this.example = function(str) {
    if (!_command.examples) {
      _command.examples = [];
    }
    _command.examples.push(str);
    return this;
  };

  this.alias = function(name) {
    _command.alias = name;
    return this;
  };

  this.title = function(str) {
    _command.title = str;
    return this;
  };

  this.option = function(name, opts) {
    opts = opts || {}; // accept just a name -- some options don't need properties
    if (!utils.isString(name) || !name) error("Missing option name");
    if (!utils.isObject(opts)) error("Invalid option definition:", opts);
    opts.name = name;
    _command.options.push(opts);
    return this;
  };

  this.done = function() {
    return _command;
  };
}

MapShaper.cleanArgv = function(argv) {
  argv = argv.map(function(s) {return s.trim();}); // trim whitespace
  argv = argv.filter(function(s) {return s !== '';}); // remove empty tokens
  argv = argv.map(utils.trimQuotes); // remove one level of single or dbl quotes
  return argv;
};
