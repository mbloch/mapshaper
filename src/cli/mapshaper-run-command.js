/* @requires
mapshaper-affine
mapshaper-clean
mapshaper-clip-erase
mapshaper-cluster
mapshaper-colorizer
mapshaper-data-fill
mapshaper-dissolve
mapshaper-dissolve2
mapshaper-drop
mapshaper-export
mapshaper-each
mapshaper-calc
mapshaper-file-import
mapshaper-file-export
mapshaper-filter
mapshaper-filter-rename-fields
mapshaper-filter-islands
mapshaper-filter-slivers
mapshaper-graticule
mapshaper-info
mapshaper-innerlines
mapshaper-inspect
mapshaper-join
mapshaper-keep-shapes
mapshaper-merge-files
mapshaper-merge-layers
mapshaper-points
mapshaper-point-grid
mapshaper-proj
mapshaper-polygons
mapshaper-rename-layers
mapshaper-shape
mapshaper-simplify
mapshaper-split
mapshaper-split-on-grid
mapshaper-subdivide
mapshaper-sort
mapshaper-svg-style
mapshaper-target
mapshaper-uniq
*/

// TODO: consider refactoring to allow modules
// @cmd  example: {name: "dissolve", options:{field: "STATE"}}
// @catalog: Catalog object
// @done callback: function(err, catalog)
//
api.runCommand = function(cmd, catalog, cb) {
  var name = cmd.name,
      opts = cmd.options,
      source,
      outputLayers,
      outputFiles,
      targets,
      targetDataset,
      targetLayers,
      arcs;

  try { // catch errors from synchronous functions

    T.start();
    if (!catalog) catalog = new Catalog();

    if (name == 'rename-layers') {
      // default target is all layers
      targets = catalog.findCommandTargets(opts.target || '*');
      targetLayers = targets.reduce(function(memo, obj) {
        return memo.concat(obj.layers);
      }, []);

    } else if (name == 'o') {
      // when combining GeoJSON layers, default is all layers
      // TODO: check that combine_layers is only used w/ GeoJSON output
      targets = catalog.findCommandTargets(opts.target || opts.combine_layers && '*');

    } else if (name == 'proj') {
      // accepts multiple target datasets
      targets = catalog.findCommandTargets(opts.target);

    } else {
      targets = catalog.findCommandTargets(opts.target);
      if (targets.length == 1) {
        targetDataset = targets[0].dataset;
        arcs = targetDataset.arcs;
        targetLayers = targets[0].layers;
        // target= option sets default target
        catalog.setDefaultTarget(targetLayers, targetDataset);

      } else if (targets.length > 1) {
        stop("Targetting multiple datasets is not supported");
      }
    }

    if (targets.length === 0) {
      if (opts.target) {
        stop(utils.format('Missing target: %s\nAvailable layers: %s',
            opts.target, internal.getFormattedLayerList(catalog)));
      }
      if (!(name == 'help' || name == 'graticule' || name == 'i' || name == 'point-grid' || name == 'shape' || name == 'rectangle' || name == 'polygon-grid')) {
        throw new UserError("No data is available");
      }
    }

    if (opts.source) {
      source = internal.findCommandSource(opts.source, catalog, opts);
    }

    if (name == 'affine') {
      api.affine(targetLayers, targetDataset, opts);

    } else if (name == 'data-fill') {
      internal.applyCommand(api.dataFill, targetLayers, arcs, opts);

    } else if (name == 'cluster') {
      internal.applyCommand(api.cluster, targetLayers, arcs, opts);

    } else if (name == 'calc') {
      internal.applyCommand(api.calc, targetLayers, arcs, opts);

    } else if (name == 'clean') {
      api.cleanLayers(targetLayers, targetDataset, opts);

    } else if (name == 'clip') {
      outputLayers = api.clipLayers(targetLayers, source, targetDataset, opts);

    } else if (name == 'colorizer') {
      outputLayers = api.colorizer(opts);

    } else if (name == 'dissolve') {
      outputLayers = internal.applyCommand(api.dissolve, targetLayers, arcs, opts);

    } else if (name == 'dissolve2') {
      outputLayers = api.dissolve2(targetLayers, targetDataset, opts);

    } else if (name == 'drop') {
      api.drop(catalog, targetLayers, targetDataset, opts);

    } else if (name == 'each') {
      internal.applyCommand(api.evaluateEachFeature, targetLayers, arcs, opts.expression, opts);

    } else if (name == 'erase') {
      outputLayers = api.eraseLayers(targetLayers, source, targetDataset, opts);

    } else if (name == 'explode') {
      outputLayers = internal.applyCommand(api.explodeFeatures, targetLayers, arcs, opts);

    } else if (name == 'filter') {
      outputLayers = internal.applyCommand(api.filterFeatures, targetLayers, arcs, opts);

    } else if (name == 'filter-fields') {
      internal.applyCommand(api.filterFields, targetLayers, opts.fields);

    } else if (name == 'filter-islands') {
      internal.applyCommand(api.filterIslands, targetLayers, arcs, opts);

    } else if (name == 'filter-slivers') {
      internal.applyCommand(api.filterSlivers, targetLayers, arcs, opts);

    } else if (name == 'graticule') {
      catalog.addDataset(api.graticule(targetDataset, opts));

    } else if (name == 'help') {
      internal.getOptionParser().printHelp(opts.command);

    } else if (name == 'i') {
      if (opts.replace) catalog = new Catalog();
      targetDataset = api.importFiles(cmd.options);
      if (targetDataset) {
        catalog.addDataset(targetDataset);
        outputLayers = targetDataset.layers; // kludge to allow layer naming below
      }

    } else if (name == 'info') {
      internal.printInfo(catalog.getLayers(), targetLayers);

    } else if (name == 'inspect') {
      internal.applyCommand(api.inspect, targetLayers, arcs, opts);

    } else if (name == 'innerlines') {
      outputLayers = internal.applyCommand(api.innerlines, targetLayers, arcs, opts);

    } else if (name == 'join') {
      internal.applyCommand(api.join, targetLayers, targetDataset, source, opts);

    } else if (name == 'lines') {
      outputLayers = internal.applyCommand(api.lines, targetLayers, arcs, opts);

    } else if (name == 'merge-layers') {
      // careful, returned layers are modified input layers
      if (!opts.target) {
        targetLayers = targetDataset.layers; // kludge
      }
      outputLayers = api.mergeLayers(targetLayers);

    } else if (name == 'mosaic') {
      opts.no_replace = true; // add mosaic to dataset
      outputLayers = [internal.createMosaicLayer(targetDataset, opts)];

    } else if (name == 'mosaic2') {
      outputLayers = internal.mosaic2(targetLayers, targetDataset, opts);

    } else if (name == 'o') {
      outputFiles = internal.exportTargetLayers(targets, opts);
      if (opts.final) {
        // don't propagate data if output is final
        catalog = null;
      }
      return internal.writeFiles(outputFiles, opts, done);

    } else if (name == 'point-grid') {
      outputLayers = [api.pointGrid(targetDataset, opts)];
      if (!targetDataset) {
        catalog.addDataset({layers: outputLayers});
      }

    } else if (name == 'polygon-grid') {
      catalog.addDataset(api.polygonGrid(targetDataset, opts));

    } else if (name == 'points') {
      outputLayers = internal.applyCommand(api.createPointLayer, targetLayers, arcs, opts);

    } else if (name == 'polygons') {
      outputLayers = api.polygons(targetLayers, targetDataset, opts);

    } else if (name == 'proj') {
      internal.initProjLibrary(opts, function() {
        var err = null;
        try {
          targets.forEach(function(targ) {
            var srcInfo, destInfo;
            if (opts.from) {
              srcInfo = internal.getProjectionInfo(opts.from, catalog);
              if (!srcInfo.crs) stop("Unknown projection source:", opts.from);
              internal.setDatasetProjection(targ.dataset, srcInfo);
            }
            if (opts.match || opts.projection) {
              destInfo = internal.getProjectionInfo(opts.match || opts.projection, catalog);
              api.proj(targ.dataset, destInfo, opts);
            }
          });
        } catch(e) {
          err = e;
        }
        done(err);
      });
      return; // async command

    } else if (name == 'rectangle') {
      catalog.addDataset(api.rectangle(source, opts));

    } else if (name == 'rename-fields') {
      internal.applyCommand(api.renameFields, targetLayers, opts.fields);

    } else if (name == 'rename-layers') {
      api.renameLayers(targetLayers, opts.names);

    } else if (name == 'shape') {
      catalog.addDataset(api.shape(opts));

    } else if (name == 'simplify') {
      api.simplify(targetDataset, opts);

    } else if (name == 'slice') {
      outputLayers = api.sliceLayers(targetLayers, source, targetDataset, opts);

    } else if (name == 'sort') {
      internal.applyCommand(api.sortFeatures, targetLayers, arcs, opts);

    } else if (name == 'split') {
      outputLayers = internal.applyCommand(api.splitLayer, targetLayers, opts.field, opts);

    } else if (name == 'split-on-grid') {
      outputLayers = internal.applyCommand(api.splitLayerOnGrid, targetLayers, arcs, opts);

    } else if (name == 'stitch') {
      api.stitch(targetDataset);

    } else if (name == 'subdivide') {
      outputLayers = internal.applyCommand(api.subdivideLayer, targetLayers, arcs, opts.expression);

    } else if (name == 'svg-style') {
      internal.applyCommand(api.svgStyle, targetLayers, targetDataset, opts);

    } else if (name == 'uniq') {
      internal.applyCommand(api.uniq, targetLayers, arcs, opts);

    } else if (name == 'target') {
      internal.target(catalog, opts);

    } else {
      error("Unhandled command: [" + name + "]");
    }

    // apply name parameter
    if (('name' in opts) && outputLayers) {
      // TODO: consider uniqifying multiple layers here
      outputLayers.forEach(function(lyr) {
        lyr.name = opts.name;
      });
    }

    // delete arcs if no longer needed (e.g. after -points command)
    if (targetDataset) {
      internal.cleanupArcs(targetDataset);
    }

    // integrate output layers into the target dataset
    if (outputLayers && targetDataset && outputLayers != targetDataset.layers) {
      if (opts.no_replace) {
        targetDataset.layers = targetDataset.layers.concat(outputLayers);
      } else {
        // TODO: consider replacing old layers as they are generated, for gc
        internal.replaceLayers(targetDataset, targetLayers, outputLayers);
      }
      // use command output as new default target
      catalog.setDefaultTarget(outputLayers, targetDataset);
    }
  } catch(e) {
    return done(e);
  }

  done(null);

  function done(err) {
    T.stop('-' + name);
    cb(err, err ? null : catalog);
  }
};

// Apply a command to an array of target layers
internal.applyCommand = function(func, targetLayers) {
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

internal.findCommandSource = function(sourceName, catalog, opts) {
  var sources = catalog.findCommandTargets(sourceName);
  var sourceDataset, source;
  if (sources.length > 1 || sources.length == 1 && sources[0].layers.length > 1) {
    stop(utils.format('Source [%s] matched multiple layers', sourceName));
  } else if (sources.length == 1) {
    source = {dataset: sources[0].dataset, layer: sources[0].layers[0]};
  } else {
    // assuming opts.source is a filename
    // don't need to build topology, because:
    //    join -- don't need topology
    //    clip/erase -- topology is built later, when datasets are combined
    sourceDataset = api.importFile(sourceName, utils.defaults({no_topology: true}, opts));
    if (!sourceDataset) {
      stop(utils.format('Unable to find source [%s]', sourceName));
    } else if (sourceDataset.layers.length > 1) {
      stop('Multiple-layer sources are not supported');
    }
    // mark as disposable to indicate that data can be mutated
    source = {dataset: sourceDataset, layer: sourceDataset.layers[0], disposable: true};
  }
  return source;
};
