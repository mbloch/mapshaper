/* @requires
mapshaper-affine
mapshaper-buffer
mapshaper-clean
mapshaper-clip-erase
mapshaper-cluster
mapshaper-colorizer
mapshaper-data-fill
mapshaper-dissolve
mapshaper-dissolve2
mapshaper-divide
mapshaper-dots
mapshaper-drop
mapshaper-export
mapshaper-each
mapshaper-external
mapshaper-calc
mapshaper-file-import
mapshaper-file-export
mapshaper-filter
mapshaper-filter-geom
mapshaper-filter-rename-fields
mapshaper-filter-islands
mapshaper-filter-slivers
mapshaper-frame
mapshaper-fuzzy-join
mapshaper-graticule
mapshaper-include
mapshaper-info
mapshaper-innerlines
mapshaper-inspect
mapshaper-join
mapshaper-keep-shapes
mapshaper-lines
mapshaper-merge-files
mapshaper-merge-layers
mapshaper-mosaic
mapshaper-points
mapshaper-point-grid
mapshaper-polygon-grid
mapshaper-proj
mapshaper-polygons
mapshaper-rectangle
mapshaper-rename-layers
mapshaper-require
mapshaper-run
mapshaper-scalebar
mapshaper-shape
mapshaper-simplify
mapshaper-variable-simplify
mapshaper-snap
mapshaper-sort
mapshaper-split
mapshaper-split-on-grid
mapshaper-subdivide
mapshaper-svg-style
mapshaper-symbols
mapshaper-target
mapshaper-union
mapshaper-uniq
mapshaper-source-utils
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
      outputDataset,
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

    } else if (name == 'info' || name == 'proj' || name == 'drop' || name == 'target') {
      // these commands accept multiple target datasets
      targets = catalog.findCommandTargets(opts.target);

    } else {
      targets = catalog.findCommandTargets(opts.target);

      // special case to allow -merge-layers and -union to combine layers from multiple datasets
      // TODO: support multi-dataset targets for other commands
      if (targets.length > 1 && (name == 'merge-layers' || name == 'union')) {
        targets = internal.mergeCommandTargets(targets, catalog);
      }

      if (targets.length == 1) {
        targetDataset = targets[0].dataset;
        arcs = targetDataset.arcs;
        targetLayers = targets[0].layers;
        // target= option sets default target
        catalog.setDefaultTarget(targetLayers, targetDataset);

      } else if (targets.length > 1) {
        stop("This command does not support targetting layers from different datasets");
      }
    }

    if (targets.length === 0) {
      if (opts.target) {
        stop(utils.format('Missing target: %s\nAvailable layers: %s',
            opts.target, internal.getFormattedLayerList(catalog)));
      }
      if (!(name == 'graticule' || name == 'i' || name == 'help' ||
          name == 'point-grid' || name == 'shape' || name == 'rectangle' ||
          name == 'include')) {
        throw new UserError("No data is available");
      }
    }

    if (opts.source) {
      source = internal.findCommandSource(internal.convertSourceName(opts.source, targets), catalog, opts);
    }

    if (name == 'affine') {
      api.affine(targetLayers, targetDataset, opts);

    } else if (name == 'buffer') {
      // applyCommandToEachLayer(api.buffer, targetLayers, targetDataset, opts);
      outputLayers = api.buffer(targetLayers, targetDataset, opts);

    } else if (name == 'data-fill') {
      applyCommandToEachLayer(api.dataFill, targetLayers, arcs, opts);

    } else if (name == 'cluster') {
      applyCommandToEachLayer(api.cluster, targetLayers, arcs, opts);

    } else if (name == 'calc') {
      applyCommandToEachLayer(api.calc, targetLayers, arcs, opts);

    } else if (name == 'clean') {
      api.cleanLayers(targetLayers, targetDataset, opts);

    } else if (name == 'clip') {
      outputLayers = api.clipLayers(targetLayers, source, targetDataset, opts);

    } else if (name == 'colorizer') {
      outputLayers = api.colorizer(opts);

    } else if (name == 'dissolve') {
      outputLayers = applyCommandToEachLayer(api.dissolve, targetLayers, arcs, opts);

    } else if (name == 'dissolve2') {
      outputLayers = api.dissolve2(targetLayers, targetDataset, opts);

    } else if (name == 'divide') {
      api.divide(targetLayers, targetDataset, source, opts);

    } else if (name == 'dots') {
      outputLayers = applyCommandToEachLayer(api.dots, targetLayers, arcs, opts);

    } else if (name == 'drop') {
      api.drop2(catalog, targets, opts);
      // api.drop(catalog, targetLayers, targetDataset, opts);

    } else if (name == 'each') {
      applyCommandToEachLayer(api.evaluateEachFeature, targetLayers, arcs, opts.expression, opts);

    } else if (name == 'erase') {
      outputLayers = api.eraseLayers(targetLayers, source, targetDataset, opts);

    } else if (name == 'explode') {
      outputLayers = applyCommandToEachLayer(api.explodeFeatures, targetLayers, arcs, opts);

    } else if (name == 'external') {
      internal.external(opts);

    } else if (name == 'filter') {
      outputLayers = applyCommandToEachLayer(api.filterFeatures, targetLayers, arcs, opts);

    } else if (name == 'filter-fields') {
      applyCommandToEachLayer(api.filterFields, targetLayers, opts.fields);

    } else if (name == 'filter-geom') {
      applyCommandToEachLayer(api.filterGeom, targetLayers, arcs, opts);

    } else if (name == 'filter-islands') {
      applyCommandToEachLayer(api.filterIslands, targetLayers, targetDataset, opts);

    } else if (name == 'filter-slivers') {
      applyCommandToEachLayer(api.filterSlivers, targetLayers, targetDataset, opts);

    } else if (name == 'frame') {
      api.frame(catalog, source, opts);

    } else if (name == 'fuzzy-join') {
      applyCommandToEachLayer(api.fuzzyJoin, targetLayers, arcs, source, opts);

    } else if (name == 'graticule') {
      catalog.addDataset(api.graticule(targetDataset, opts));

    } else if (cmd.name == 'help') {
      // placing this here to handle errors from invalid command names
      internal.getOptionParser().printHelp(cmd.options.command);

    } else if (name == 'i') {
      if (opts.replace) catalog = new Catalog();
      targetDataset = api.importFiles(cmd.options);
      if (targetDataset) {
        catalog.addDataset(targetDataset);
        outputLayers = targetDataset.layers; // kludge to allow layer naming below
      }

    } else if (name == 'include') {
      internal.include(opts);

    } else if (name == 'info') {
      // internal.printInfo(catalog.getLayers(), targetLayers);
      internal.printInfo(internal.expandCommandTargets(targets));

    } else if (name == 'inspect') {
      applyCommandToEachLayer(api.inspect, targetLayers, arcs, opts);

    } else if (name == 'innerlines') {
      outputLayers = applyCommandToEachLayer(api.innerlines, targetLayers, arcs, opts);

    } else if (name == 'join') {
      applyCommandToEachLayer(api.join, targetLayers, targetDataset, source, opts);

    } else if (name == 'lines') {
      outputLayers = applyCommandToEachLayer(api.lines, targetLayers, targetDataset, opts);

    } else if (name == 'merge-layers') {
      // returned layers are modified input layers
      // (assumes that targetLayers are replaced by outputLayers below)
      outputLayers = api.mergeLayers(targetLayers, opts);

    } else if (name == 'mosaic') {
      // opts.no_replace = true; // add mosaic as a new layer
      // outputLayers = internal.mosaic(targetDataset, opts);
      outputLayers = api.mosaic(targetLayers, targetDataset, opts);

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

    } else if (name == 'grid') {
      outputDataset = api.polygonGrid(targetLayers, targetDataset, opts);

    } else if (name == 'points') {
      outputLayers = applyCommandToEachLayer(api.createPointLayer, targetLayers, targetDataset, opts);

    } else if (name == 'polygons') {
      outputLayers = api.polygons(targetLayers, targetDataset, opts);

    } else if (name == 'proj') {
      internal.initProjLibrary(opts, function() {
        var err = null;
        try {
          targets.forEach(function(targ) {
            var destArg = opts.match || opts.crs || opts.projection;
            var srcInfo, destInfo;
            if (opts.from) {
              srcInfo = internal.getCrsInfo(opts.from, catalog);
              if (!srcInfo.crs) stop("Unknown projection source:", opts.from);
              internal.setDatasetCRS(targ.dataset, srcInfo);
            }
            if (destArg) {
              destInfo = internal.getCrsInfo(destArg, catalog);
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
      if (source || opts.bbox || targets.length === 0) {
        catalog.addDataset(api.rectangle(source, opts));
      } else {
        outputLayers = api.rectangle2(targets[0], opts);
      }

    } else if (name == 'rectangles') {
      outputLayers = applyCommandToEachLayer(api.rectangles, targetLayers, targetDataset, opts);

    } else if (name == 'rename-fields') {
      applyCommandToEachLayer(api.renameFields, targetLayers, opts.fields);

    } else if (name == 'rename-layers') {
      api.renameLayers(targetLayers, opts.names);

    } else if (name == 'require') {
      api.require(targets, opts);

    } else if (name == 'run') {
      api.run(targets, catalog, opts, done);
      return;

    } else if (name == 'scalebar') {
      api.scalebar(catalog, opts);

    } else if (name == 'shape') {
      catalog.addDataset(api.shape(opts));

    } else if (name == 'simplify') {
      if (opts.variable) {
        api.variableSimplify(targetLayers, targetDataset, opts);
      } else {
        api.simplify(targetDataset, opts);
      }

    } else if (name == 'slice') {
      outputLayers = api.sliceLayers(targetLayers, source, targetDataset, opts);

    } else if (name == 'snap') {
      api.snap(targetDataset, opts);

    } else if (name == 'sort') {
      applyCommandToEachLayer(api.sortFeatures, targetLayers, arcs, opts);

    } else if (name == 'split') {
      outputLayers = applyCommandToEachLayer(api.splitLayer, targetLayers, opts.field, opts);

    } else if (name == 'split-on-grid') {
      outputLayers = applyCommandToEachLayer(api.splitLayerOnGrid, targetLayers, arcs, opts);

    } else if (name == 'stitch') {
      api.stitch(targetDataset);

    } else if (name == 'style') {
      applyCommandToEachLayer(api.svgStyle, targetLayers, targetDataset, opts);

    } else if (name == 'symbols') {
      applyCommandToEachLayer(api.symbols, targetLayers, opts);

    } else if (name == 'subdivide') {
      outputLayers = applyCommandToEachLayer(api.subdivideLayer, targetLayers, arcs, opts.expression);

    } else if (name == 'target') {
      internal.target(catalog, opts);

    } else if (name == 'union') {
      outputLayers = api.union(targetLayers, targetDataset, opts);

    } else if (name == 'uniq') {
      applyCommandToEachLayer(api.uniq, targetLayers, arcs, opts);

    } else {
      // throws error if cmd is not registered
      internal.runExternalCommand(cmd, catalog);
    }

    // apply name parameter
    if (('name' in opts) && outputLayers) {
      // TODO: consider uniqifying multiple layers here
      outputLayers.forEach(function(lyr) {
        lyr.name = opts.name;
      });
    }

    if (outputDataset) {
      catalog.addDataset(outputDataset); // also sets default target
      outputLayers = outputDataset.layers;
      if (targetLayers && !opts.no_replace) {
        // remove target layers from target dataset
        targetLayers.forEach(function(lyr) {
          catalog.deleteLayer(lyr, targetDataset);
        });
      }
    } else if (outputLayers && targetDataset && outputLayers != targetDataset.layers) {
      // integrate output layers into the target dataset
      if (opts.no_replace) {
        // make sure commands do not return input layers with 'no_replace' option
        if (!internal.outputLayersAreDifferent(outputLayers, targetLayers || [])) {
          error('Command returned invalid output');
        }

        targetDataset.layers = targetDataset.layers.concat(outputLayers);
      } else {
        // TODO: consider replacing old layers as they are generated, for gc
        internal.replaceLayers(targetDataset, targetLayers, outputLayers);
        // some operations leave unreferenced arcs that should be cleaned up
        if ((name == 'clip' || name == 'erase' || name == 'rectangle' ||
            name == 'rectangles' || name == 'filter' && opts.cleanup) && !opts.no_cleanup) {
          internal.dissolveArcs(targetDataset);
        }
      }
      // use command output as new default target
      catalog.setDefaultTarget(outputLayers, targetDataset);
    }



    // delete arcs if no longer needed (e.g. after -points command)
    // (after output layers have been integrated)
    if (targetDataset) {
      internal.cleanupArcs(targetDataset);
    }
  } catch(e) {
    return done(e);
  }

  done(null);

  function done(err) {
    T.stop('-');
    cb(err, err ? null : catalog);
  }
};

internal.outputLayersAreDifferent = function(output, input) {
  return !utils.some(input, function(lyr) {
    return output.indexOf(lyr) > -1;
  });
};


// Apply a command to an array of target layers
function applyCommandToEachLayer(func, targetLayers) {
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
}

