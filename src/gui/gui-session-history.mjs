import { internal } from './gui-core';

export function SessionHistory(gui) {
  var commands = [];
  // commands that can be ignored when checking for unsaved changes
  var nonEditingCommands = 'i,target,info,version,verbose,projections,inspect,help,h,encodings,calc'.split(',');

  this.unsavedChanges = function() {
    var cmd, cmdName;
    for (var i=commands.length - 1; i >= 0; i--) {
      cmdName = getCommandName(commands[i]);
      if (cmdName == 'o') break;
      if (nonEditingCommands.includes(cmdName)) continue;
      return true;
    }
    return false;
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

  this.dataValueUpdated = function(id, field, value) {
    var cmd = `-each 'd[${JSON.stringify(field)}] = ${JSON.stringify(value)}' where='this.id == ${id}'`;
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
