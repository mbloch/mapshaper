/* @requires mapshaper-cli-lib */

// parse command line args into commands and run them
api.runShellArgs = function(argv, done) {
  var commands = api.parseCommands(argv);
  if (commands.length === 0) {
    MapShaper.printHelp();
  } else {
    commands = MapShaper.runAndRemoveInfoCommands(commands);
  }

  if (commands.length === 0) {
    done();
  } else {
    // if there's no -o command and no -info command,
    // append a generic -o command.
    if (!Utils.some(commands, function(cmd) {
      return cmd.name == 'o' || cmd.name == 'info' ;})) {
      //message("Add a -o command to generate output");
      commands.push({name: "o", options: {}});
    }
    api.runCommands(commands, done);
  }
};

// run a string of command line args
// (useful for testing -- doesn't append -o like runShellArgs())
api.runCommandString = function(str, done) {
  var parse = require('shell-quote').parse,
      commands = api.parseCommands(parse(str));
  api.runCommands(commands, done);
};

// execute a sequence of data processing commands
// (assumes informational commands like -help have been removed)
api.runCommands = function(commands, done) {
  // need exactly one -i command
  if (utils.filter(commands, function(cmd) {return cmd.name == 'i';}).length != 1) {
    done("mapshaper expects one -i command");
  }
  // move -i to the front
  MapShaper.promoteCommand('i', commands);
  var imports = MapShaper.divideImportCommand(commands.shift());

  T.start("Start timing");
  utils.reduceAsync(imports, null, function(empty, cmd, cb) {
    var dataset = api.importFiles(cmd.options);
    api.processDataset(dataset, commands, cb);
  }, function(err, data) {
    T.stop("Total time");
    done(err, data);
  });
};

// Run a sequence of commands to transform a dataset
// Assumes that certain commands have already been handled and removed from
// the list -- e.g. -i and -help
//
// @done callback: function(err, dataset)
//
api.processDataset = function(dataset, commands, done) {
  utils.reduceAsync(commands, dataset, function(data, cmd, cb) {
    api.runCommand(cmd, data, cb);
  }, done);
};

// TODO: consider refactoring to allow modules
// @cmd  example: {name: "dissolve", options:{field: "STATE"}}
// @dataset  format: {arcs: <ArcCollection>, layers:[]}
// @done callback: function(err, dataset)
//
api.runCommand = function(cmd, dataset, cb) {
  var name = cmd.name,
      opts = cmd.options,
      srcLayers,
      newLayers,
      arcs = dataset.arcs,
      err = null;

  T.start();
  if (opts.target) {
    srcLayers = MapShaper.findMatchingLayers(dataset.layers, opts.target);
    console.log("layers:", Utils.pluck(dataset.layers, 'name'));
    console.log("target:", opts.target, "lyr:", Utils.pluck(srcLayers, 'name'));
  } else {
    srcLayers = dataset.layers; // default: all layers
  }

  if (srcLayers.length === 0) {
    message("[" + name + "] Command is missing target layer(s).");
    MapShaper.printLayerNames(dataset.layers);
  }

  if (name == 'each') {
    MapShaper.applyCommand(api.evaluateLayer, srcLayers, arcs, opts.expression);

  } else if (name == 'dissolve') {
    newLayers = MapShaper.applyCommand(api.dissolveLayer, srcLayers, arcs, opts);

  } else if (name == 'divide') {
    api.divideArcs(dataset.layers, arcs, opts);
    newLayers = MapShaper.applyCommand(api.divideLayer, srcLayers, arcs, opts);

  } else if (name == 'explode') {
    newLayers = MapShaper.applyCommand(api.explodeLayer, srcLayers, arcs, opts);

  } else if (name == 'fields') {
    MapShaper.applyCommand(api.filterFields, srcLayers, opts.fields);

  } else if (name == 'filter') {
    MapShaper.applyCommand(api.filterFeatures, srcLayers, arcs, opts.expression);

  } else if (name == 'info') {
    api.printInfo(dataset);

  } else if (name == 'innerlines') {
    newLayers = MapShaper.applyCommand(api.convertLayerToInnerLines, srcLayers, arcData);

  } else if (name == 'join') {
    // async command -- special case
    api.importJoinTableAsync(opts.source, opts, function(table) {
      MapShaper.applyCommand(api.joinTableToLayer, srcLayers, table, opts);
      done(err, dataset);
    });
    return;

  } else if (name == 'layers') {
    newLayers = MapShaper.applyCommand(api.filterLayers, dataset.layers, opts.layers);

  } else if (name == 'lines') {
    MapShaper.applyCommand(api.convertLayerToTypedLines, srcLayers, arcs, opts.fields);

  } else if (name == 'merge-layers') {
    // careful, returned layers are modified input layers
    newLayers = api.mergeLayers(srcLayers);

  } else if (name == 'simplify') {
    api.simplify(arcs, opts);
    if (opts.keep_shapes) {
      api.protectShapes(arcs, srcLayers);
    }

  } else if (name == 'split') {
    newLayers = MapShaper.applyCommand(api.splitLayer, srcLayers, arcs, opts.field);

  } else if (name == 'split-on-grid') {
    newLayers = MapShaper.applyCommand(api.splitOnGrid, srcLayers, arcs, opts.rows, opts.cols);

  } else if (name == 'subdivide') {
    newLayers = MapShaper.applyCommand(api.subdivideLayer, srcLayers, arcs, opts.expression);

  } else if (name == 'o') {
    api.exportFiles(Utils.defaults({layers: srcLayers}, dataset), opts);

  } else {
    err = "Unhandled command: -" + name;
  }

  if (opts.name) {
    (newLayers || srcLayers).forEach(function(lyr) {
      lyr.name = opts.name;
    });
  }

  if (newLayers) {
    if (opts.no_replace) {
      dataset.layers = dataset.layers.concat(newLayers);
    } else {
      // TODO: consider replacing old layers as they are generated, for gc
      MapShaper.replaceLayers(dataset, srcLayers, newLayers);
    }
  }
  done(err, dataset);

  function done(err, dataset) {
    T.stop('-' + name);
    cb(err, dataset);
  }
};

// Apply a command to an array of layers
MapShaper.applyCommand = function(func, srcLayers) {
  var args = Utils.toArray(arguments).slice(2);
  return srcLayers.reduce(function(memo, lyr) {
    var result = func.apply(null, [lyr].concat(args));
    if (Utils.isArray(result)) { // some commands return an array of layers
      memo = memo.concat(result);
    } else if (result) { // assuming result is a layer
      memo.push(result);
    }
    return memo;
  }, []);
};

MapShaper.divideImportCommand = function(cmd) {
  var opts = cmd.options,
      imports;
  if (opts.combine_files || opts.merge_files || opts.files.length <= 1) {
    imports = [cmd];
  } else {
    imports = opts.files.map(function(file) {
      return {
        name: cmd.name,
        options: Utils.defaults({files:[file]}, opts)
      };
    });
  }
  return imports;
};

api.exportFiles = function(dataset, opts) {
  if (!opts.format) {
    opts.format = dataset.info.input_format || error("[o] Missing export format");
  }

  var exports = MapShaper.exportFileContent(dataset, opts);

  var paths = cli.getOutputPaths(Utils.pluck(exports, 'filename'), opts.output_dir);
  exports.forEach(function(obj, i) {
    var path = paths[i];
    cli.writeFile(path, obj.content);
    console.log("Wrote " + path);
  });
};

api.importFiles = function(opts) {
  var files = opts.files,
      dataset;
  if ((opts.merge_files || opts.combine_files) && files.length > 1) {
    dataset = api.mergeFiles(files, opts);
  } else if (files && files.length == 1) {
    dataset = api.importFile(files[0], opts);
  } else {
    // handle error
  }
  return dataset;
};

utils.reduceAsync = function(arr, memo, iter, done) {
  var i=0;
  next(null, memo);
  function next(err, result) {
    if (i < arr.length === false || err) {
      done(err, result);
    } else {
      // TODO: consider detaching from stack using setTimeout()
      iter(result, arr[i++], next);
    }
  }
};

// Handle information commands and remove them from the list
MapShaper.runAndRemoveInfoCommands = function(commands) {
  return Utils.filter(commands, function(cmd) {
    if (cmd.name == 'version') {
      console.log(getVersion());
    } else if (cmd.name == 'encodings') {
      MapShaper.printEncodings();
    } else if (cmd.name == 'help') {
      MapShaper.printHelp();
    } else if (cmd.name == 'verbose') {
      C.VERBOSE = true;
    } else {
      return true;
    }
    return false;
  });
};

MapShaper.printHelp = function() {
  MapShaper.getOptionParser().printHelp();
};

// TODO: handle multiple instances of a command, return number found
// Assumes only one of this kind of command
MapShaper.promoteCommand = function(name, commands) {
  var cmd = Utils.find(commands, function(cmd) {
    return cmd.name == name;
  });
  var idx = commands.indexOf(cmd);
  if (idx > 0) {
    commands.unshift(commands.splice(idx, 1)[0]);
  }
};

// @target is a layer identifier or a comma-sep. list of identifiers
// an identifier is a literal name, a name containing "*" wildcard or
// a 0-based array index
MapShaper.findMatchingLayers = function(layers, target) {
  var ii = [];
  target.split(',').forEach(function(id) {
    var i = Number(id),
        rxp = utils.wildcardToRegExp(id);
    if (Utils.isInteger(i)) {
      ii.push(i); // TODO: handle out-of-range index
    } else {
      layers.forEach(function(lyr, i) {
        if (rxp.test(lyr.name)) ii.push(i);
      });
    }
  });

  ii = Utils.uniq(ii); // remove dupes
  return Utils.map(ii, function(i) {
    return layers[i];
  });
};

utils.wildcardToRegExp = function(name) {
  var rxp = name.split('*').map(function(str) {
    return utils.regexEscape(str);
  }).join('.*');
  return new RegExp(rxp);
};

MapShaper.printLayerNames = function(layers) {
  var max = 10;
  message("Available layers:");
  if (layers.length === 0) {
    message("[none]");
  } else {
    for (var i=0; i<layers.length; i++) {
      if (i <= max) {
        message("... " + (layers.length - max) + " more");
        break;
      }
      message("[" + i + "]  " + (layers[i].name || "[unnamed]"));
    }
  }
};
