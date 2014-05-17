/* @requires mapshaper-common */

function CommandParser() {
  var _usage = "",
      _examples = [],
      _commands = [];

  if (this instanceof CommandParser === false) return new CommandParser();

  this.usage = function(str) {
    _usage = str;
    return this;
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
        commandRxp = /^--?([\w-]+)$/i,
        commands = [], cmd,
        argv = raw.concat(), // make copy, so we can consume the array
        cmdName, cmdDef, opt;

    while (argv.length > 0) {
      cmdName = readCommandName(argv);
      if (!cmdName) error("Invalid command:", argv[0]);
      cmdDef = findCommandDefn(cmdName, commandDefs);
      if (!cmdDef) {
        error("Unknown command:", '-' + cmdName);
      }
      cmd = {
        name: cmdDef.name,
        options: {},
        _: []
      };

      while (moreOptions(argv)) {
        opt = readOption(argv, cmdDef);
        if (!opt) {
          // not a defined option; add it to _ array for later processing
          cmd._.push(argv.shift());
        } else {
          cmd.options[opt[0]] = opt[1];
        }
      }

      if (cmdDef.validate) cmdDef.validate(cmd.options, cmd._);
      commands.push(cmd);
    }
    return commands;

    function moreOptions(argv) {
      return argv.length > 0 && !commandRxp.test(argv[0]);
    }

    function readOption(argv, cmdDef) {
      var token = argv[0],
          optRxp = /^([a-z0-9_+-]+)=(.+)$/i,
          match = optRxp.exec(token),
          name = match ? match[1] : token,
          optDef = findOptionDefn(name, cmdDef),
          optName,
          optVal;
          // console.log("readO(); name:", name, 'defn', optDef)

      if (!optDef) return null;

      if (match && (optDef.type == 'flag' || optDef.assign_to)) {
        error("-" + cmdDef.name + " " + name + " doesn't take a value");
      }

      if (match) {
        argv[0] = match[2];
      } else {
        argv.shift();
      }

      optName = optDef.assign_to || optDef.name.replace(/-/g, '_');
      optVal = readOptionValue(argv, optDef);
      if (optVal === null) {
        error("Invalid value for -" + cmdDef.name + " " + optName);
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

    function readCommandName(args) {
      var match = commandRxp.exec(args[0]);
      if (match) {
        args.shift();
        return match[1];
      }
      return null;
    }

    function findCommandDefn(name, arr) {
      return Utils.find(arr, function(cmd) {
        return cmd.name === name || cmd.alias === name;
      });
    }

    function findOptionDefn(name, cmd) {
      return Utils.find(cmd.options, function(o) {
        return o.name === name || o.alias === name;
      });
    }
  };

  this.getHelpMessage = function() {
    var commands = getCommands(),
        cmdPre = ' ',
        optPre = '  ',
        gutter = ' ',
        colWidth = 0;

    commands.forEach(function(obj) {
      if (obj.describe) {
        var help = cmdPre + (obj.name ? "-" + obj.name : "");
        if (obj.alias) help += ", -" + obj.alias;
        obj.help = help;
        colWidth = Math.max(colWidth, help.length);
      }
      obj.options.forEach(formatOption);
    });

    var helpStr = _usage ? _usage + "\n\n" : "";
    commands.forEach(function(obj, i) {
      if ('title' in obj) helpStr += obj.title + "\n";
      if (obj.describe) helpStr += formatHelpLine(obj.help, obj.describe);
      if (obj.options.length > 0) {
        obj.options.forEach(addOptionHelp);
        helpStr += '\n';
      }
    });

    if (_examples.length > 0) {
      helpStr += "\nExamples\n";
      _examples.forEach(function(str) {
        helpStr += "\n" + str + "\n";
      });
    }

    return helpStr;

    function formatHelpLine(help, desc) {
      return Utils.rpad(help, colWidth, ' ') + gutter + (desc || '') + '\n';
    }

    function formatOption(o) {
      // console.log("formatOption:", opt)
      if (o.describe) {
        o.help = optPre + o.name;
        if (o.alias) o.help += ", " + o.alias;
        if (o.type != 'flag' && !o.assign_to) o.help += "=";
        colWidth = Math.max(colWidth, o.help.length);
      }
    }

    function addOptionHelp(o) {
      if (o.help) {
        helpStr += formatHelpLine(o.help, o.describe);
      }
    }
  };

  this.printHelp = function() {
    console.log(this.getHelpMessage());
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
    if (!Utils.isString(name) || !name) error("Missing option name");
    if (!validateOption(opts)) error("Invalid option definition:", opts);
    opts.name = name;
    _command.options.push(opts);
    return this;
  };

  this.done = function() {
    return _command;
  };

  function validateOption(obj) {
    return Utils.isObject(obj);
  }
}
