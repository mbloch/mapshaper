
/* @requires mapshaper-common */

function CommandParser() {
  var _usage = "",
      _commands = [];

  if (this instanceof CommandParser === false) return new CommandParser();

  this.usage = function(str) {
    _usage = str;
    return this;
  };

  this.command = function(name) {
    var opts = new CommandOptions(name);
    _commands.push(opts);
    return opts;
  };

  this.parseArgv = function(raw) {
    var commandDefs = getCommands(),
        commands = [], cmd,
        argv = raw.concat(), // make copy, so we can consume the array
        cmdName, cmdDef, optName, optDef, optVal;

    while (argv.length > 0) {
      cmdName = readCommandName(argv);
      if (!cmdName) error("Invalid command:", argv[0]);
      cmdDef = findCommandDefn(cmdName, commandDefs);
      if (!cmdDef) error("Unknown command:", '-' + cmdName);
      cmd = {
        name: cmdDef.name,
        options: {},
        _: []
      };
      commands.push(cmd);

      optName = readOptionName(argv);
      while (optName) {
        optDef = findOptionDefn(optName, cmdDef);
        if (!optDef) {
          // not a defined option; add it to _ array for later processing
          cmd._.push(optName);
        } else {
          // found a defined option; get its value
          optVal = readOptionValue(argv, optDef);
          if (optVal === null) error("Invalid value for", optName + ":", argv[0]);
          addOption(optDef, optVal);
        }
        optName = readOptionName(argv);
      }
    }
    return commands;

    function addOption(def, value) {
      var name = def.assign_to || def.name.replace(/-/g, '_');
      cmd.options[name] = value;
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
        } else if (type) {
          val = null; // unknown type
        } else {
          val = raw; // string
        }

        if (val !== val || val === null) {
          val = null;
        } else {
          args.shift(); // good value, remove from argv
        }
      }

      return val;
    }

    function readCommandName(args) {
      var cmdRxp = /^--?([\w-]+)$/i,
          match = cmdRxp.exec(args[0]);
      if (match) {
        args.shift();
        return match[1];
      }
      return null;
    }

    function readOptionName(args) {
      if (args.length === 0) return null;
      var optValRxp = /^([a-z0-9_+-]+)=(.+)$/i,
          match = optValRxp.exec(args[0]),
          name;
      if (match) {
        name = match[1];
        args[0] = match[2];
      } else if (readCommandName([args[0]])) {
        name = null;
      } else {
        name = args.shift();
      }

      return name;
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
        colWidth = 0;

    commands.forEach(function(obj) {
      var help = obj.name ? "-" + obj.name : "";
      if (obj.alias) help += ", -" + obj.alias;
      obj.help = help;
      colWidth = Math.max(colWidth, help.length);
      obj.options.forEach(formatOption);
    });

    var helpStr = _usage ? _usage + "\n" : "";

    if (commands.length > 0) {
      helpStr += "Commands and options:\n";
      commands.forEach(function(obj, i) {
        helpStr += formatHelpLine(obj.help, obj.describe);
        if (obj.options.length > 0) {
          obj.options.forEach(addOptionHelp);
          helpStr += '\n';
        }
      });
    }

    return helpStr;

    function formatHelpLine(help, desc) {
      return ' ' + Utils.rpad(help, colWidth, ' ') + '  ' + (desc || '') + '\n';
    }

    function formatOption(o) {
      // console.log("formatOption:", opt)
      if (o.describe) {
        o.help = o.name + (o.alias ? ", " + o.alias : "") + (o.type == 'flag' ? "" : "=");
        colWidth = Math.max(colWidth, o.help.length);
      }
    }

    function addOptionHelp(o) {
      if (o.help) {
        helpStr += formatHelpLine(' ' + o.help, o.describe);
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

  this.describe = function(str) {
    _command.describe = str;
    return this;
  };

  this.alias = function(name) {
    _command.alias = name;
    return this;
  };

  this.option = function(name, opts) {
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
