import { internal } from './gui-core';

export function SessionHistory(gui) {
  var commands = [];
  // index of first command after the last "save" boundary; commands at indices
  // [savedAtIndex .. commands.length) are considered unsaved
  var savedAtIndex = 0;
  // commands that can be ignored when checking for unsaved changes
  var nonEditingCommands = 'i,target,info,version,verbose,projections,inspect,help,h,encodings,calc,comment'.split(',');

  this.unsavedChanges = function() {
    for (var i = commands.length - 1; i >= savedAtIndex; i--) {
      var cmdName = getCommandName(commands[i]);
      if (nonEditingCommands.includes(cmdName)) continue;
      return true;
    }
    return false;
  };

  this.isEmpty = function() {
    return commands.length === 0;
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
      commands: commands.slice(),
      savedAtIndex: savedAtIndex
    };
  };

  // Replace the current history with one captured by getHistorySnapshot().
  // Used when restoring an in-session snapshot. If the snapshot has no history
  // (e.g. older snapshots, or external .msx files), starts from a clean state.
  this.restoreHistorySnapshot = function(obj) {
    if (obj && Array.isArray(obj.commands)) {
      commands = obj.commands.slice();
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
    commands.push(cmd);
  };

  this.layerRenamed = function(lyr, name) {
    var currTarget = getCurrentTarget();
    var layerTarget = getTargetFromLayer(lyr);
    if (currTarget == layerTarget) {
      commands.push('-rename-layers ' + name);
    } else {
      commands.push('-rename-layers ' + name + ' target=' + layerTarget);
      commands.push('-target ' + currTarget);
    }
  };

  this.consoleCommands = function(str) {
    commands.push(str); // todo: split commands?
  };

  this.simplificationApplied = function(optStr) {
    commands.push('-simplify ' + optStr);
  };

  this.simplificationRepair = function() {
    //  TODO: improve this... repair does not necessarily apply to most recent
    //  simplification command
    //  consider adding a (hidden) repair command to handle this event
    var i = indexOfLastCommand('-simplify');
    if (i > -1) {
      commands[i] = commands[i].replace(' no-repair', '');
    }
  };

  this.updateSimplificationPct = function(pct) {
    var i = indexOfLastCommand('-simplify');
    if (i > -1) {
      commands[i] = commands[i].replace(/percentage=[^ ]+/, 'percentage=' + pct);
    }
  };

  this.dataValueUpdated = function(ids, field, value) {
    var cmd = `-each 'd[${JSON.stringify(field)}] = ${JSON.stringify(value)}' ids=${ids.join(",")}`;
    commands.push(cmd);
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
    commands.push(cmd);
    // -o writes data to a durable location, so treat this as a save boundary
    savedAtIndex = commands.length;
  };

  this.setTargetLayer = function(lyr) {
    var layers = gui.model.getLayers();
    if (layers.length > 1) {
      if (indexOfLastCommand('-target') == commands.length - 1) {
        commands.pop(); // if last commands was -target, remove it
      }
      commands.push('-target ' + getTargetFromLayer(lyr));
    }
  };

  this.toCommandLineString = function() {
    var str = commands.join(' \\\n  ');
    return 'mapshaper ' + str;
  };

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
