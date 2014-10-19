/* @requires mapshaper-cli-lib */

// parse command line args into commands and run them
api.runShellArgs = function(argv, done) {
  var commands;
  try {
    commands = MapShaper.parseCommands(argv);
  } catch(e) {
    return done(e);
  }
  if (commands.length === 0) {
    return done(new APIError("Missing an input file"));
  }

  // if there's a -i command, no -o command and no -info command,
  // append a generic -o command.
  if (!utils.some(commands, function(cmd) { return cmd.name == 'o'; }) &&
      !utils.some(commands, function(cmd) { return cmd.name == 'info'; }) &&
      utils.some(commands, function(cmd) {return cmd.name == 'i'; })) {
    commands.push({name: "o", options: {}});
  }

  T.start("Start timing");
  api.runCommands(commands, function(err, dataset) {
    T.stop("Total time");
    done(err);
  });
};

// Execute a sequence of commands
// Signature: function(commands, [dataset,] done)
// @commands either a string of commands or an array of parsed commands
//
api.runCommands = function(commands) {
  var dataset = null,
      done, args;

  if (utils.isFunction(arguments[1])) {
    done = arguments[1];
  } else if (utils.isFunction(arguments[2])) {
    dataset = arguments[1];
    done = arguments[2];
  } else {
    error("Missing callback");
  }

  if (utils.isString(commands)) {
    try {
      args = require('shell-quote').parse(commands);
      commands = MapShaper.parseCommands(args);
    } catch(e) {
      return done(e);
    }
  }

  commands = MapShaper.runAndRemoveInfoCommands(commands);
  if (commands.length === 0) {
    return done(null, dataset);
  }
  commands = MapShaper.divideImportCommand(commands);
  if (commands[0].name != 'i' && !dataset) {
    return done(new APIError("Missing a -i command"));
  }

  utils.reduceAsync(commands, dataset, function(dataset, cmd, nextCmd) {
    api.runCommand(cmd, dataset, nextCmd);
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
      targetLayers,
      newLayers,
      sourceLyr,
      arcs;

  try { // catch errors from synchronous functions

    T.start();
    if (dataset) {
      arcs = dataset.arcs;
      if (opts.target) {
        targetLayers = MapShaper.findMatchingLayers(dataset.layers, opts.target);
      } else {
        targetLayers = dataset.layers; // default: all layers
      }
      if (targetLayers.length === 0) {
        message("[-" + name + "] Command is missing target layer(s).");
        MapShaper.printLayerNames(dataset.layers);
      }
    }

    if (name == 'clip') {
      sourceLyr = MapShaper.getSourceLayer(opts.source, dataset, opts);
      newLayers = api.clipLayers(targetLayers, sourceLyr, dataset, opts);

    } else if (name == 'each') {
      MapShaper.applyCommand(api.evaluateEachFeature, targetLayers, arcs, opts.expression);

    } else if (name == 'dissolve') {
      newLayers = MapShaper.applyCommand(api.dissolvePolygons, targetLayers, arcs, opts);

    } else if (name == 'dissolve2') {
      newLayers = MapShaper.applyCommand(api.dissolvePolygons2, targetLayers, dataset, opts);

    } else if (name == 'erase') {
      sourceLyr = MapShaper.getSourceLayer(opts.source, dataset, opts);
      newLayers = api.eraseLayers(targetLayers, sourceLyr, dataset, opts);

    } else if (name == 'explode') {
      newLayers = MapShaper.applyCommand(api.explodeFeatures, targetLayers, arcs, opts);

    } else if (name == 'filter-fields') {
      MapShaper.applyCommand(api.filterFields, targetLayers, opts.fields);

    /*
    } else if (name == 'fill-holes') {
      MapShaper.applyCommand(api.fillHoles, targetLayers, opts);
    */

    } else if (name == 'filter') {
      MapShaper.applyCommand(api.filterFeatures, targetLayers, arcs, opts.expression);

    } else if (name == 'flatten') {
      newLayers = MapShaper.applyCommand(api.flattenLayer, targetLayers, dataset, opts);

    } else if (name == 'i') {
      dataset = api.importFiles(cmd.options);

    } else if (name == 'info') {
      api.printInfo(dataset);

    } else if (name == 'innerlines') {
      newLayers = MapShaper.applyCommand(api.convertPolygonsToInnerLines, targetLayers, arcs);

    } else if (name == 'join') {
      var table = api.importJoinTable(opts.source, opts);
      MapShaper.applyCommand(api.joinAttributesToFeatures, targetLayers, table, opts);

    } else if (name == 'layers') {
      newLayers = MapShaper.applyCommand(api.filterLayers, dataset.layers, opts.layers);

    } else if (name == 'lines') {
      newLayers = MapShaper.applyCommand(api.convertPolygonsToTypedLines, targetLayers, arcs, opts.fields);

    } else if (name == 'merge-layers') {
      // careful, returned layers are modified input layers
      newLayers = api.mergeLayers(targetLayers);

    } else if (name == 'o') {
      api.exportFiles(Utils.defaults({layers: targetLayers}, dataset), opts);

    } else if (name == 'rename-layers') {
      api.renameLayers(targetLayers, opts.names);

    } else if (name == 'repair') {
      newLayers = MapShaper.repairPolygonGeometry(targetLayers, dataset, opts);

    } else if (name == 'simplify') {
      api.simplify(arcs, opts);
      if (opts.keep_shapes) {
        api.keepEveryPolygon(arcs, targetLayers);
      }

    } else if (name == 'split') {
      newLayers = MapShaper.applyCommand(api.splitLayer, targetLayers, arcs, opts.field);

    } else if (name == 'split-on-grid') {
      newLayers = MapShaper.applyCommand(api.splitLayerOnGrid, targetLayers, arcs, opts.rows, opts.cols);

    } else if (name == 'subdivide') {
      newLayers = MapShaper.applyCommand(api.subdivideLayer, targetLayers, arcs, opts.expression);

    } else {
      error("Unhandled command: [" + name + "]");
    }

    if (opts.name) {
      (newLayers || targetLayers).forEach(function(lyr) {
        lyr.name = opts.name;
      });
    }

    if (newLayers) {
      if (opts.no_replace) {
        dataset.layers = dataset.layers.concat(newLayers);
      } else {
        // TODO: consider replacing old layers as they are generated, for gc
        MapShaper.replaceLayers(dataset, targetLayers, newLayers);
      }
    }
    done(null, dataset);

  } catch(e) {
    done(e, null);
  }

  function done(err, dataset) {
    T.stop('-' + name);
    cb(err, dataset);
  }
};

// Apply a command to an array of target layers
MapShaper.applyCommand = function(func, targetLayers) {
  var args = Utils.toArray(arguments).slice(2);
  return targetLayers.reduce(function(memo, lyr) {
    var result = func.apply(null, [lyr].concat(args));
    if (Utils.isArray(result)) { // some commands return an array of layers
      memo = memo.concat(result);
    } else if (result) { // assuming result is a layer
      memo.push(result);
    }
    return memo;
  }, []);
};

MapShaper.divideImportCommand = function(commands) {
  var firstCmd = commands[0],
      opts = firstCmd.options,
      files = opts.files || [];

  if (firstCmd.name != 'i' || files.length <= 1 || opts.stdin || opts.merge_files || opts.combine_files) {
    return commands;
  }
  return files.reduce(function(memo, file) {
    var importCmd = {
      name: 'i',
      options: Utils.defaults({files:[file]}, opts)
    };
    memo.push(importCmd);
    memo.push.apply(memo, commands.slice(1));
    return memo;
  }, []);
};

api.exportFiles = function(dataset, opts) {
  if (!opts.format) {
    if (opts.output_file) {
      opts.format = MapShaper.guessFileFormat(opts.output_file, dataset.info.input_format);
    } else {
      opts.format = dataset.info.input_format;
    }
  }
  var exports = MapShaper.exportFileContent(dataset, opts);
  if (exports.length > 0 === false) {
    message("No files to save");
  } else if (opts.stdout) {
    Node.writeFile('/dev/stdout', exports[0].content);
  } else {
    var paths = MapShaper.getOutputPaths(Utils.pluck(exports, 'filename'), opts);
    exports.forEach(function(obj, i) {
      var path = paths[i];
      Node.writeFile(path, obj.content);
      message("Wrote " + path);
    });
  }
};

api.importFiles = function(opts) {
  var files = opts.files,
      dataset;
  if ((opts.merge_files || opts.combine_files) && files.length > 1) {
    dataset = api.mergeFiles(files, opts);
  } else if (files && files.length == 1) {
    dataset = api.importFile(files[0], opts);
  } else if (opts.stdin) {
    dataset = api.importFile('/dev/stdin', opts);
  } else {
    // err
  }
  return dataset;
};

// Call @iter on each member of an array (similar to Array#reduce(iter))
//    iter: function(memo, item, callback)
// Call @done when all members have been processed or if an error occurs
//    done: function(err, memo)
// @memo: Initial value
//
utils.reduceAsync = function(arr, memo, iter, done) {
  var i=0;
  next(null, memo);

  function next(err, memo) {
    // Detach next operation from call stack to prevent overflow
    // Don't use setTimeout(, 0) -- this can introduce a long delay if
    //   previous operation was slow, as of Node 0.10.32
    if (err) {
      done(err, null);
    } else if (i < arr.length === false) {
      done(null, memo);
    } else {
      setImmediate(function() {
        iter(memo, arr[i++], next);
      });
    }
  }
};

// Handle information commands and remove them from the list
MapShaper.runAndRemoveInfoCommands = function(commands) {
  return Utils.filter(commands, function(cmd) {
    if (cmd.name == 'version') {
      console.error(getVersion());
    } else if (cmd.name == 'encodings') {
      MapShaper.printEncodings();
    } else if (cmd.name == 'help') {
      MapShaper.printHelp(cmd.options.commands);
    } else if (cmd.name == 'verbose') {
      MapShaper.VERBOSE = true;
    } else if (cmd.name == 'tracing') {
      MapShaper.TRACING = true;
    } else {
      return true;
    }
    return false;
  });
};

MapShaper.printHelp = function(commands) {
  MapShaper.getOptionParser().printHelp(commands);
};

// @src: a layer identifier or a filename
// if file -- import layer(s) from the file, merge arcs into @dataset,
//   but don't add source layer(s) to the dataset
//
MapShaper.getSourceLayer = function(src, dataset, opts) {
  var match = MapShaper.findMatchingLayers(dataset.layers, src),
      lyr;
  if (match.length > 1) {
    stop("[-" + name + "] command received more than one source layer");
  } else if (match.length == 1) {
    lyr = match[0];
  } else {
    // assuming src is a filename
    var clipData = api.importFile(src, opts);
    // merge arcs from source data, but don't merge layer(s)
    dataset.arcs = MapShaper.mergeDatasets([dataset, clipData]).arcs;
    // TODO: handle multi-layer sources, e.g. TopoJSON files
    lyr = clipData.layers[0];
  }
  return lyr || null;
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
      message("[-" + i + "]  " + (layers[i].name || "[unnamed]"));
    }
  }
};
