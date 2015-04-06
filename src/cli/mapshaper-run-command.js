/* @requires
mapshaper-clip-erase
mapshaper-dissolve
mapshaper-dissolve2
mapshaper-export
mapshaper-each-calc
mapshaper-file-import
mapshaper-file-export
mapshaper-filter
mapshaper-filter-rename-fields
mapshaper-filter-islands
mapshaper-info
mapshaper-innerlines
mapshaper-join
mapshaper-keep-shapes
mapshaper-mend
mapshaper-merge-files
mapshaper-points
mapshaper-proj
mapshaper-rename-layers
mapshaper-simplify
mapshaper-split
mapshaper-split-on-grid
mapshaper-subdivide
mapshaper-sort
*/

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
        message("[" + name + "] Command is missing target layer(s).");
        MapShaper.printLayerNames(dataset.layers);
      }
    }

    if (name == 'calc') {
      MapShaper.applyCommand(api.calc, targetLayers, arcs, opts);

    } else if (name == 'clip') {
      newLayers = api.clipLayers(targetLayers, opts.source, dataset, opts);

    } else if (name == 'dissolve') {
      newLayers = MapShaper.applyCommand(api.dissolvePolygons, targetLayers, arcs, opts);

    } else if (name == 'dissolve2') {
      newLayers = MapShaper.applyCommand(api.dissolvePolygons2, targetLayers, dataset, opts);

    } else if (name == 'each') {
      MapShaper.applyCommand(api.evaluateEachFeature, targetLayers, arcs, opts.expression);

    } else if (name == 'erase') {
      newLayers = api.eraseLayers(targetLayers, opts.source, dataset, opts);

    } else if (name == 'explode') {
      newLayers = MapShaper.applyCommand(api.explodeFeatures, targetLayers, arcs, opts);

    } else if (name == 'filter') {
      MapShaper.applyCommand(api.filterFeatures, targetLayers, arcs, opts);

    } else if (name == 'filter-fields') {
      MapShaper.applyCommand(api.filterFields, targetLayers, opts.fields);

    } else if (name == 'filter-islands') {
      MapShaper.applyCommand(api.filterIslands, targetLayers, arcs, opts);

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

    } else if (name == 'mend') {
      api.mend(dataset);

    } else if (name == 'merge-layers') {
      // careful, returned layers are modified input layers
      newLayers = api.mergeLayers(targetLayers);

    } else if (name == 'o') {
      api.exportFiles(utils.defaults({layers: targetLayers}, dataset), opts);

    } else if (name == 'points') {
      newLayers = MapShaper.applyCommand(api.createPointLayer, targetLayers, arcs, opts);

    } else if (name == 'proj') {
      api.proj(dataset, opts);

    } else if (name == 'rename-fields') {
      MapShaper.applyCommand(api.renameFields, targetLayers, opts.fields);

    } else if (name == 'rename-layers') {
      api.renameLayers(targetLayers, opts.names);

    } else if (name == 'repair') {
      newLayers = MapShaper.repairPolygonGeometry(targetLayers, dataset, opts);

    } else if (name == 'simplify') {
      api.simplify(arcs, opts);
      if (opts.keep_shapes) {
        api.keepEveryPolygon(arcs, targetLayers);
      }

    } else if (name == 'sort') {
      MapShaper.applyCommand(api.sortFeatures, targetLayers, arcs, opts);

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
  } catch(e) {
    done(e, null);
    return;
  }
  done(null, dataset);

  function done(err, dataset) {
    T.stop('-' + name);
    cb(err, dataset);
  }
};

// Apply a command to an array of target layers
MapShaper.applyCommand = function(func, targetLayers) {
  var args = utils.toArray(arguments).slice(2);
  return targetLayers.reduce(function(memo, lyr) {
    var result = func.apply(null, [lyr].concat(args));
    if (utils.isArray(result)) { // some commands return an array of layers
      memo = memo.concat(result);
    } else if (result) { // assuming result is a layer
      memo.push(result);
    }
    return memo;
  }, []);
};

api.exportFiles = function(dataset, opts) {
  var exports = MapShaper.exportFileContent(dataset, opts);
  if (exports.length > 0 === false) {
    message("No files to save");
  } else if (opts.stdout) {
    cli.writeFile('/dev/stdout', exports[0].content);
  } else {
    var paths = MapShaper.getOutputPaths(utils.pluck(exports, 'filename'), opts);
    exports.forEach(function(obj, i) {
      var path = paths[i];
      cli.writeFile(path, obj.content);
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
    error('[i] Missing content');
  }
  return dataset;
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
