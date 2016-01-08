/* @requires mapshaper-common */

function CommandParser() {
  var _usage = "",
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
        commandRxp = /^--?([a-z][\w-]*)$/i,
        commands = [], cmd,
        argv = raw.map(utils.trimQuotes), // remove one level of single or dbl quotes
        cmdName, cmdDef, opt;

    while (argv.length > 0) {
      // if there are arguments before the first explicit command, use the default command
      if (commands.length === 0 && moreOptions(argv)) {
        cmdName = _default;
      } else {
        cmdName = readCommandName(argv);
      }
      if (!cmdName) stop("Invalid command:", argv[0]);
      cmdDef = findCommandDefn(cmdName, commandDefs);
      if (!cmdDef) {
        stop("Unknown command:", cmdName);
      }
      cmd = {
        name: cmdDef.name,
        options: {},
        _: []
      };

      while (moreOptions(argv)) {
        opt = readNamedOption(argv, cmdDef);
        if (!opt) {
          // not a defined option; add it to _ array for later processing
          cmd._.push(argv.shift());
        } else {
          cmd.options[opt[0]] = opt[1];
        }
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

    function moreOptions(argv) {
      return argv.length > 0 && !commandRxp.test(argv[0]);
    }

    function readNamedOption(argv, cmdDef) {
      var token = argv[0],
          optRxp = /^([a-z0-9_+-]+)=(?!\=)(.*)$/i, // exclude ==
          match = optRxp.exec(token),
          name = match ? match[1] : token,
          optDef = findOptionDefn(name, cmdDef),
          optName,
          optVal;

      if (!optDef) return null;

      if (match && (optDef.type == 'flag' || optDef.assign_to)) {
        stop("-" + cmdDef.name + " " + name + " doesn't take a value");
      }

      if (match) {
        argv[0] = utils.trimQuotes(match[2]);
      } else {
        argv.shift();
      }

      optName = optDef.assign_to || optDef.name.replace(/-/g, '_');
      optVal = readOptionValue(argv, optDef);
      if (optVal === null) {
        stop("Invalid value for -" + cmdDef.name + " " + optName + "=<value>");
      }
      return [optName, optVal];
    }

    function readOptionValue(args, def) {
      var type = def.type,
          raw, val;
      if (type == 'flag') {
        val = true;
      } else if (def.assign_to) { // opt is a member of a set, assigned to another name
        val = def.name;
      } else if (args.length === 0 || commandRxp.test(args[0])) {
        val = null;
      } else {
        raw = args[0];
        if (type == 'number') {
          val = Number(raw);
        } else if (type == 'integer') {
          val = Math.round(Number(raw));
        } else if (type == 'comma-sep') {
          val = raw.split(',');
        } else if (type) {
          val = null; // unknown type
        } else {
          val = raw; // string
        }

        if (val !== val || val === null) {
          val = null; // null indicates invalid value
        } else {
          args.shift(); // good value, remove from argv
        }
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
