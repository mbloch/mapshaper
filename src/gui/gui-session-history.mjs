import { internal } from './gui-core';

export function SessionHistory(gui) {
  var commands = [];
  var commandId = 0;
  // index of first command after the last "save" boundary; commands at indices
  // [savedAtIndex .. commands.length) are considered unsaved
  var savedAtIndex = 0;
  // commands that can be ignored when checking for unsaved changes
  var nonEditingCommands = 'i,target,info,version,verbose,projections,inspect,help,h,encodings,calc,comment'.split(',');

  this.unsavedChanges = function() {
    for (var i = commands.length - 1; i >= savedAtIndex; i--) {
      if (!commandIsActive(commands[i])) continue;
      var cmdName = getCommandName(getCommandString(commands[i]));
      if (nonEditingCommands.includes(cmdName)) continue;
      return true;
    }
    return false;
  };

  this.isEmpty = function() {
    return getActiveCommands().length === 0;
  };

  // Mark the current end of the history as a "saved" boundary -- called after
  // data has been written somewhere durable (e.g. an -o export). Snapshots
  // are session-scoped and are NOT durable, so creating one does not mark saved.
  this.markSaved = function() {
    savedAtIndex = commands.length;
  };

  // Capture a serializable copy of the history for inclusion in a snapshot.
  this.getHistorySnapshot = function() {
    return {
      commands: getActiveCommands(),
      savedAtIndex: Math.min(savedAtIndex, getActiveCommands().length)
    };
  };

  // Replace the current history with one captured by getHistorySnapshot().
  // Used when restoring an in-session snapshot. If the snapshot has no history
  // (e.g. older snapshots, or external .msx files), starts from a clean state.
  this.restoreHistorySnapshot = function(obj) {
    if (obj && Array.isArray(obj.commands)) {
      commands = obj.commands.map(createCommandEntry);
      savedAtIndex = typeof obj.savedAtIndex == 'number' ?
        Math.min(obj.savedAtIndex, commands.length) : commands.length;
    } else {
      commands = [];
      savedAtIndex = 0;
    }
  };

  this.fileImported = function(file, optStr) {
    var cmd = '-i ' + file;
    if (optStr) {
      cmd += ' ' + optStr;
    }
    addCommand(cmd);
  };

  this.layerRenamed = function(lyr, name) {
    var currTarget = getCurrentTarget();
    var layerTarget = getTargetFromLayer(lyr);
    if (currTarget == layerTarget) {
      addCommand('-rename-layers ' + name);
    } else {
      addCommand('-rename-layers ' + name + ' target=' + layerTarget);
      addCommand('-target ' + currTarget);
    }
  };

  this.consoleCommands = function(str) {
    return addCommand(str); // todo: split commands?
  };

  this.setCommandsActive = function(ids, active) {
    var idIndex = {};
    (ids || []).forEach(function(id) {
      idIndex[id] = true;
    });
    commands.forEach(function(entry) {
      if (entry && idIndex[entry.id]) {
        entry.active = !!active;
      }
    });
  };

  this.simplificationApplied = function(optStr) {
    addCommand('-simplify ' + optStr);
  };

  this.simplificationRepair = function() {
    //  TODO: improve this... repair does not necessarily apply to most recent
    //  simplification command
    //  consider adding a (hidden) repair command to handle this event
    var i = indexOfLastCommand('-simplify');
    if (i > -1) {
      commands[i].command = commands[i].command.replace(' no-repair', '');
    }
  };

  this.updateSimplificationPct = function(pct) {
    var i = indexOfLastCommand('-simplify');
    if (i > -1) {
      commands[i].command = commands[i].command.replace(/percentage=[^ ]+/, 'percentage=' + pct);
    }
  };

  this.dataValueUpdated = function(ids, field, value) {
    var cmd = `-each 'd[${JSON.stringify(field)}] = ${JSON.stringify(value)}' ids=${ids.join(",")}`;
    addCommand(cmd);
  };

  this.layersExported = function(ids, optStr) {
    var layers = gui.model.getLayers();
    var cmd = '-o';
    if (layers.length > 1) {
      cmd += ' target=' + ids.map(getTargetFromId).join(',');
    }
    if (optStr) {
      cmd += ' ' + optStr;
    }
    addCommand(cmd);
    // -o writes data to a durable location, so treat this as a save boundary
    savedAtIndex = commands.length;
  };

  this.setTargetLayer = function(lyr) {
    var layers = gui.model.getLayers();
    if (layers.length > 1) {
      if (indexOfLastCommand('-target') == commands.length - 1) {
        commands.pop(); // if last commands was -target, remove it
      }
      addCommand('-target ' + getTargetFromLayer(lyr));
    }
  };

  this.toCommandLineString = function() {
    var str = getActiveCommands().join(' \\\n  ');
    return 'mapshaper ' + str;
  };

  function addCommand(cmd) {
    discardInactiveTail();
    commands.push(createCommandEntry(cmd));
    return commands[commands.length - 1].id;
  }

  function createCommandEntry(cmd) {
    if (cmd && typeof cmd == 'object') {
      commandId = Math.max(commandId, cmd.id || 0);
      return {
        id: cmd.id || ++commandId,
        command: cmd.command || '',
        active: cmd.active !== false
      };
    }
    return {
      id: ++commandId,
      command: cmd,
      active: true
    };
  }

  function discardInactiveTail() {
    while (commands.length > 0 && !commandIsActive(commands[commands.length - 1])) {
      commands.pop();
    }
    savedAtIndex = Math.min(savedAtIndex, commands.length);
  }

  function getActiveCommands() {
    return commands.filter(commandIsActive).map(getCommandString);
  }

  function commandIsActive(entry) {
    return entry && entry.active !== false;
  }

  function getCommandString(entry) {
    return typeof entry == 'string' ? entry : entry.command;
  }

  function getCommandName(cmd) {
    var rxp = /^-([a-z0-9-]+)/;
    var match = rxp.exec(cmd);
    return match ? match[1] : null;
  }

  function getCurrentTarget() {
    return getTargetFromLayer(gui.model.getActiveLayer().layer);
  }

  function indexOfLastCommand(cmd) {
    return commands.reduce(function(memo, str, i) {
      str = commandIsActive(str) ? getCommandString(str) : '';
      return str.indexOf(cmd) === 0 ? i : memo;
    }, -1);
  }

  function getTargetFromId(id) {
    var layers = gui.model.getLayers();
    return getTargetFromLayer(layers[id - 1].layer);
  }

  function getTargetFromLayer(lyr) {
    var id = internal.getLayerTargetId(gui.model, lyr);
    return internal.formatOptionValue(id);
  }
}
