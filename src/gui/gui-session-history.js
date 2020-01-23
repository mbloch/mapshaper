
function SessionHistory(gui) {
  var commands = [];

  gui.model.on('select', function(e) {
    var layers = gui.model.getLayers();
    if (layers.length > 1) {
      if (indexOfLastCommand('-target') == commands.length - 1) {
        // if last commands was -target, remove it
        commands.pop();
      }
      // TODO: only when necessary
      commands.push('-target ' + getTargetFromLayer(e.layer));
    }
  });

  // used for ...
  this.unsavedChanges = function() {
    return commands.length > 0 && commands[commands.length-1].indexOf('-o ') == -1;
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

  this.toCommandLineString = function() {
    var str = commands.join(' \\\n  ');
    return 'mapshaper ' + str;
  };

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
    var layers = gui.model.getLayers();
    var id = 0;
    layers.forEach(function(o, i) {
      if (o.layer == lyr) id = i + 1;
    });
    if (lyr.name && isUniqueLayerName(lyr.name, layers)) {
      return lyr.name;
    } else if (id > 0) {
      return id;
    }
    // error
  }

  function isUniqueLayerName(name, layers) {
    return layers.reduce(function(memo, obj) {
      return obj.layer.name == name ? memo + 1 : memo;
    }, 0) == 1;
  }

}
