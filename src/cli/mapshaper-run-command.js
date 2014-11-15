/* @requires
mapshaper-clip-erase
mapshaper-dissolve
mapshaper-dissolve2
mapshaper-export
mapshaper-each-calc
mapshaper-file-import
mapshaper-file-export
mapshaper-filter
mapshaper-filter-fields
mapshaper-filter-islands
mapshaper-info
mapshaper-innerlines
mapshaper-join
mapshaper-keep-shapes
mapshaper-merge-files
mapshaper-points
mapshaper-rename-layers
mapshaper-simplify
mapshaper-split
mapshaper-split-on-grid
mapshaper-subdivide
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
        message("[" + name + "] Command is missing target layer(s).");
        MapShaper.printLayerNames(dataset.layers);
      }
    }

    if (name == 'calc') {
      MapShaper.applyCommand(api.calc, targetLayers, arcs, opts);

    } else if (name == 'clip') {
      sourceLyr = MapShaper.getSourceLayer(opts.source, dataset, opts);
      newLayers = api.clipLayers(targetLayers, sourceLyr, dataset, opts);

    } else if (name == 'dissolve') {
      newLayers = MapShaper.applyCommand(api.dissolvePolygons, targetLayers, arcs, opts);

    } else if (name == 'dissolve2') {
      newLayers = MapShaper.applyCommand(api.dissolvePolygons2, targetLayers, dataset, opts);

    } else if (name == 'each') {
      MapShaper.applyCommand(api.evaluateEachFeature, targetLayers, arcs, opts.expression);

    } else if (name == 'erase') {
      sourceLyr = MapShaper.getSourceLayer(opts.source, dataset, opts);
      newLayers = api.eraseLayers(targetLayers, sourceLyr, dataset, opts);

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

    } else if (name == 'merge-layers') {
      // careful, returned layers are modified input layers
      newLayers = api.mergeLayers(targetLayers);

    } else if (name == 'o') {
      api.exportFiles(Utils.defaults({layers: targetLayers}, dataset), opts);

    } else if (name == 'points') {
      newLayers = MapShaper.applyCommand(api.createPointLayer, targetLayers, opts);

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


api.exportFiles = function(dataset, opts) {
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
    error('[i] Missing content');
  }
  return dataset;
};

// @src: a layer identifier or a filename
// if file -- import layer(s) from the file, merge arcs into @dataset,
//   but don't add source layer(s) to the dataset
//
MapShaper.getSourceLayer = function(src, dataset, opts) {
  var match = MapShaper.findMatchingLayers(dataset.layers, src),
      lyr;
  if (match.length > 1) {
    stop("[" + name + "] command received more than one source layer");
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
