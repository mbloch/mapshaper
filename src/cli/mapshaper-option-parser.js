/* @requires mapshaper-common, mapshaper-chunker */

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

  this.section = function(name) {
    return this.command("").title(name);
  };

  this.parseArgv = function(raw) {
    var commandDefs = getCommands(),
        commands = [], cmd,
        argv = internal.cleanArgv(raw),
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

      try {
        if (cmd._.length > 0 && cmdDef.no_arg) {
          error("Received one or more unexpected parameters:", cmd._.join(' '));
        }
        if (cmd._.length > 1 && !cmdDef.multi_arg) {
          error("Command expects a single value. Received:", cmd._.join(' '));
        }
        if (cmdDef.default && cmd._.length == 1) {
          // TODO: support multiple-token values, like -i filenames
          readDefaultOptionValue(cmd, cmdDef);
        }
        if (cmdDef.validate) {
          cmdDef.validate(cmd);
        }
      } catch(e) {
        stop("[" + cmdName + "] " + e.message);
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
      if (argv.length === 0 || tokenLooksLikeCommand(argv[0])) {
        stop("Missing value for " + optDef.name + " option");
      }
      return parseOptionValue(argv.shift(), optDef); // remove token from argv
    }

    function readDefaultOptionValue(cmd, cmdDef) {
      var optDef = findOptionDefn(cmdDef.default, cmdDef);
      cmd.options[cmdDef.default] = readOptionValue(cmd._, optDef);
    }

    function parseOptionValue(token, optDef) {
      var type = optDef.type;
      var val, err;
      if (type == 'number') {
        val = Number(token);
      } else if (type == 'integer') {
        val = Math.round(Number(token));
      } else if (type == 'colors') {
        val = internal.parseColorList(token);
      } else if (type == 'strings') {
        val = internal.parseStringList(token);
      } else if (type == 'bbox' || type == 'numbers') {
        val = token.split(',').map(parseFloat);
      } else if (type == 'percent') {
        val = utils.parsePercent(token);
      } else {
        val = token; // assume string type
      }

      if (val !== val) {
        err = "Invalid numeric value";
      }

      if (err) {
        stop(err + " for " + optDef.name + " option");
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

    function findOptionDefn(name, cmdDef) {
      return utils.find(cmdDef.options, function(o) {
        return o.name === name || o.alias === name;
      });
    }
  };

  this.getHelpMessage = function(commandName) {
    var helpStr = '',
        cmdPre = '  ',
        optPre = '  ',
        exPre = '  ',
        gutter = '  ',
        colWidth = 0,
        detailView = false,
        cmd, helpCommands;

    helpCommands = getCommands().filter(function(cmd) {
      // hide commands without a description, except section headers
      return !!cmd.describe || cmd.title;
    });

    if (commandName) {
      cmd = utils.find(helpCommands, function(cmd) {return cmd.name == commandName;});
      if (!cmd) {
        stop(commandName, "is not a known command");
      }
      detailView = true;
      helpCommands = [cmd];
    }

    if (!detailView) {
      if (_usage) {
        helpStr += _usage + "\n\n";
      }
    }

    // Format help strings, calc width of left column.
    colWidth = helpCommands.reduce(function(w, cmd) {
      var help = cmdPre + (cmd.name ? "-" + cmd.name : "");
      if (cmd.alias) help += ", -" + cmd.alias;
      cmd.help = help;
      if (detailView) {
        w = cmd.options.reduce(function(w, opt) {
          if (opt.describe) {
            w = Math.max(formatOption(opt, cmd), w);
          }
          return w;
        }, w);
      }
      return Math.max(w, help.length);
    }, 0);

    // Layout help display
    helpCommands.forEach(function(cmd) {
      if (!detailView && cmd.title) {
        helpStr += cmd.title;
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

    function formatOption(o, cmd) {
      o.help = optPre;
      if (o.label) {
        o.help += o.label;
      } else if (o.name == cmd.default) {
        o.help += '<' + o.name + '>';
      } else {
        o.help += o.name;
        if (o.alias) o.help += ", " + o.alias;
        if (o.type != 'flag' && !o.assign_to) o.help += "=";
      }
      return o.help.length;
    }

  };

  this.printHelp = function(command) {
    message(this.getHelpMessage(command));
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

  this.flag = function(name) {
    _command[name] = true;
    return this;
  };

  this.option = function(name, opts) {
    opts = opts || {}; // accept just a name -- some options don't need properties
    if (!utils.isString(name) || !name) error("Missing option name");
    if (!utils.isObject(opts)) error("Invalid option definition:", opts);
    // default option -- assign unnamed argument to this option
    if (opts.DEFAULT) _command.default = name;
    opts.name = name;
    _command.options.push(opts);
    return this;
  };

  this.done = function() {
    return _command;
  };
}

// Split comma-delimited list, trim quotes from entire list and
// individual members
internal.parseStringList = function(token) {
  var delim = ',';
  var list = internal.splitTokens(token, delim);
  if (list.length == 1) {
    list = internal.splitTokens(list[0], delim);
  }
  return list;
};

// Accept spaces and/or commas as delimiters
internal.parseColorList = function(token) {
  var delim = ', ';
  var list = internal.splitTokens(token, delim);
  if (list.length == 1) {
    list = internal.splitTokens(list[0], delim);
  }
  return list;
};

internal.cleanArgv = function(argv) {
  argv = argv.map(function(s) {return s.trim();}); // trim whitespace
  argv = argv.filter(function(s) {return s !== '';}); // remove empty tokens
  argv = argv.map(utils.trimQuotes); // remove one level of single or dbl quotes
  return argv;
};
