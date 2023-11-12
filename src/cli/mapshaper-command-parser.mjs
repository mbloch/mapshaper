import {
  parseStringList,
  parseColorList,
  parseNumberList,
  cleanArgv,
  isAssignment,
  splitAssignment
} from '../cli/mapshaper-option-parsing-utils';
import utils from '../utils/mapshaper-utils';
import { stop, print, error } from '../utils/mapshaper-logging';
import { runningInBrowser } from '../mapshaper-env';

export function CommandParser() {
  var commandRxp = /^--?([a-z][\w-]*)$/i,
      invalidCommandRxp = /^--?[a-z][\w-]*[=]/i, // e.g. -target=A // could be more general
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
    // support 'verbose' and 'debug' flags for each command, without help entries
    opts.option('verbose', {type: 'flag'});
    opts.option('debug', {type: 'flag'});
    _commands.push(opts);
    return opts;
  };

  this.section = function(name) {
    return this.command("").title(name);
  };

  this.isCommandName = tokenIsCommandName;

  this.parseArgv = function(raw) {
    var commandDefs = getCommands(),
        commands = [], cmd,
        argv = cleanArgv(raw),
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
      cmdDef = findCommandDefn(cmdName, commandDefs) || null;
      if (!cmdDef) {
        cmd = parseUnknownCommandOptions(argv, cmdName);
      } else {
        cmd = parseCommandOptions(argv, cmdDef);
      }
      commands.push(cmd);
    }
    return commands;

    function parseCommandOptions(argv, cmdDef) {
      var cmd = {
        name: cmdDef.name,
        options: {},
        _: []
      };

      while (argv.length > 0 && !tokenLooksLikeCommand(argv[0])) {
        readOption(cmd, argv, cmdDef);
      }

      try {
        if (cmd._.length > 0) {
          readDefaultOptionValue(cmd, cmdDef);
        }
        if (cmdDef.validate) {
          cmdDef.validate(cmd);
        }
        delete cmd.options._; // kludge to remove -o placeholder option
      } catch(e) {
        stop("[" + cmdName + "] " + e.message);
      }
      return cmd;
    }

    function parseUnknownCommandOptions(argv, cmdName) {
      // In order to support adding commands at runtime, unknown commands
      // are parsed without options (tokens get stored for later parsing)
      var cmd = {
        name: cmdName,
        options: {},
        _: []
      };
      while (argv.length > 0 && !tokenLooksLikeCommand(argv[0])) {
        cmd._.push(argv.shift());
      }
      return cmd;
    }

    function tokenLooksLikeCommand(s) {
      if (invalidCommandRxp.test(s)) {
        stop('Invalid command syntax:', s);
      }
      return commandRxp.test(s);
    }

    // Try to read an option for command @cmdDef from @argv
    function readOption(cmd, argv, cmdDef) {
      var token = argv.shift(),
          optName, optDef, parts;

      if (isAssignment(token)) {
        // token looks like name=value style option
        parts = splitAssignment(token);
        optDef = findOptionDefn(parts[0], cmdDef);
        if (!optDef) {
          // left-hand identifier is not a recognized option...
          // assignment to an unrecognized identifier could be an expression
          // (e.g. -each 'id=$.id') -- handle this case below
        } else if (optDef.type == 'flag' || optDef.assign_to) {
          stop("-" + cmdDef.name + " " + parts[0] + " option doesn't take a value");
        } else {
          argv.unshift(parts[1]);
        }
      } else {
        // try to parse as a flag option,
        // or as a space-delimited assignment option (for backwards compatibility)
        optDef = findOptionDefn(token, cmdDef);
      }

      if (!optDef) {
        // token is not a known option -- add to array of unnamed options
        cmd._.push(token);
        return;
      }

      if (optDef.alias_to) {
        optDef = findOptionDefn(optDef.alias_to, cmdDef);
      }

      optName = optDef.name;
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

    // convert strings in cmd._ array to command parameers in cmd.options object
    //
    function readDefaultOptionValue(cmd, cmdDef) {
      var optDef = findDefaultOptionDefn(cmdDef);
      var argv = cmd._;
      var value;
      if (cmdDef)
      if (!optDef) {
        // no option has been specified as the default option
        error('Received one or more unexpected parameters:', argv.join(' '));
      }
      // DEFAULT may be true (simple case of one argument) or an object
      var argDef = optDef.DEFAULT === true ? {} : optDef.DEFAULT;
      argDef.type = argDef.type || optDef.type || 'string';
      argDef.name = optDef.name; // used in parse error message

      if (argv.length > 1 && !argDef.multi_arg) {
        error((argDef.multi_error_msg || 'Command expects a single value.'),
          'Received:', argv.join(' '));
      }

      argv = argv.map(arg => parseOptionValue(arg, argDef));
      if (!argDef.multi_arg) {
        value = argv[0];
      } else if (utils.isString(argDef.join)) {
        value = argv.join(argDef.join);
      } else {
        value = argv;
      }
      cmd.options[optDef.name] = value;
    }

    function parseOptionValue(token, optDef) {
      var type = optDef.type;
      var val, err;
      if (type == 'number') {
        val = Number(token);
      } else if (type == 'integer') {
        val = Math.round(Number(token));
      } else if (type == 'colors') {
        val = parseColorList(token);
      } else if (type == 'strings') {
        val = parseStringList(token);
      } else if (type == 'bbox' || type == 'numbers') {
        val = parseNumberList(token);
      } else if (type == 'percent') {
        // val = utils.parsePercent(token);
        val = token; // string value is parsed by command function
      } else if (type == 'distance' || type == 'area') {
        val = token; // string value is parsed by command function
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

  };

  this.getHelpMessage = function(cmdName) {
    var helpCommands, singleCommand, lines;
    if (cmdName) {
      singleCommand = findCommandDefn(cmdName, getCommands());
      if (!singleCommand) {
        stop(cmdName, "is not a known command");
      }
      lines = getSingleCommandLines(singleCommand);
    } else {
      helpCommands = getCommands().filter(function(cmd) {return cmd.name && cmd.describe || cmd.title;});
      lines = getMultiCommandLines(helpCommands);
    }

    return formatLines(lines);

    function formatLines(lines) {
      var colWidth = calcColWidth(lines);
      var gutter = '  ';
      var indent = runningInBrowser() ? '' : '  ';
      var helpStr = lines.map(function(line) {
        if (Array.isArray(line)) {
          line = indent + utils.rpad(line[0], colWidth, ' ') + gutter + line[1];
        }
        return line;
      }).join('\n');
      return helpStr;
    }

    function getSingleCommandLines(cmd) {
      var lines = [];
      var options = [];
      cmd.options.forEach(function(opt) {
        options = options.concat(getOptionLines(opt, cmd));
      });

      lines.push('COMMAND', getCommandLine(cmd));
      if (options.length > 0) {
        lines.push('', 'OPTIONS');
        lines = lines.concat(options);
      }

      // examples
      if (cmd.examples) {
        lines.push('', 'EXAMPLE' + (cmd.examples.length > 1 ? 'S' : ''));
        cmd.examples.forEach(function(ex, i) {
          if (i > 0) lines.push('');
          ex.split('\n').forEach(function(line, i) {
            lines.push('  ' + line);
          });
        });
      }
      return lines;
    }

    function getOptionLines(opt, cmd) {
      var lines = [];
      var description = opt.describe;
      var label;
      if (!description) {
        // empty
      } else if (opt.label) {
        lines.push([opt.label, description]);
      } else if (opt.DEFAULT) {
        label = opt.name + '=';
        lines.push(['<' + opt.name + '>', 'shortcut for ' + label]);
        lines.push([label, description]);
      } else {
        label = opt.name;
        if (opt.alias) label += ', ' + opt.alias;
        if (opt.type != 'flag' && !opt.assign_to) label += '=';
        lines.push([label, description]);
      }
      return lines;
    }

    function getCommandLine(cmd) {
      var name = cmd.name ? "-" + cmd.name : '';
      if (cmd.alias) name += ', -' + cmd.alias;
      return [name, cmd.describe || '(undocumented command)'];
    }

    function getMultiCommandLines(commands) {
      var lines = [];
      // usage
      if (_usage) lines.push(_usage);

      // list of commands
      commands.forEach(function(cmd) {
        if (cmd.title) {
          lines.push('', cmd.title);
        } else {
          lines.push(getCommandLine(cmd));
        }
      });

      // examples
      if (_examples.length > 0) {
        lines.push('', 'Examples');
        _examples.forEach(function(str) {
          lines.push('', str);
        });
      }

      // note
      if (_note) {
        lines.push('', _note);
      }
      return lines;
    }


    function calcColWidth(lines) {
      var w = 0;
      lines.forEach(function(line) {
        if (Array.isArray(line)) {
          w = Math.max(w, line[0].length);
        }
      });
      return w;
    }
  };

  function getCommands() {
    return _commands.map(function(cmd) {
      return cmd.done();
    });
  }

  function tokenIsCommandName(s) {
    var cmd = findCommandDefn(s, getCommands());
    return !!cmd;
  }

  function findCommandDefn(name, arr) {
    return utils.find(arr, function(cmd) {
      return cmd.name === name || cmd.alias === name || cmd.old_alias === name;
    });
  }

  function findOptionDefn(name, cmdDef) {
    return utils.find(cmdDef.options, function(o) {
      return o.name === name || o.alias === name || o.old_alias === name;
    });
  }

  function findDefaultOptionDefn(cmdDef) {
    return utils.find(cmdDef.options, function(o) {
      return !!o.DEFAULT;
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

  // define an alias command name that doesn't appear in command line help
  // (to support old versions of renamed commands)
  this.oldAlias = function(name) {
    _command.old_alias = name;
    return this;
  };

  this.title = function(str) {
    _command.title = str;
    return this;
  };

  this.option = function(name, opts) {
    opts = utils.extend({}, opts); // accept just a name -- some options don't need properties
    if (!utils.isString(name) || !name) error("Missing option name");
    if (!utils.isObject(opts)) error("Invalid option definition:", opts);
    opts.name = name;
    _command.options.push(opts);
    return this;
  };

  this.options = function(o) {
    Object.keys(o).forEach(function(key) {
      this.option(key, o[key]);
    }, this);
    return this;
  };

  this.done = function() {
    return _command;
  };
}
