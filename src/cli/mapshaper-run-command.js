/* @requires
mapshaper-clean
mapshaper-clip-erase
mapshaper-cluster
mapshaper-dissolve
mapshaper-dissolve2
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
mapshaper-innerlines2
mapshaper-inspect
mapshaper-join
mapshaper-keep-shapes
mapshaper-merge-files
mapshaper-merge-layers
mapshaper-points
mapshaper-point-grid
mapshaper-proj
mapshaper-rename-layers
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
      sources,
      source,
      sourceDataset,
      outputLayers,
      outputFiles,
      targets,
      targetDataset,
      targetLayers,
      arcs;

  try { // catch errors from synchronous functions

    T.start();
    if (!catalog) catalog = new Catalog();
    targets = catalog.findCommandTargets(opts.target);
    if (targets.length === 0) {
      if (opts.target) {
        fail(utils.format('Missing target: %s\nAvailable layers: %s',
            opts.target, MapShaper.getFormattedLayerList(catalog)));
      }
      if (!(name == 'graticule' || name == 'i' || name == 'point-grid')) {
        throw new APIError("Missing a -i command");
      }

    } else if (targets.length == 1) {
      targetDataset = targets[0].dataset;
      arcs = targetDataset.arcs;
      targetLayers = targets[0].layers;
      // target= option sets default target
      catalog.setDefaultTarget(targetLayers, targetDataset);

    } else { // >1 target
      // TODO: decide if -o target= option should change default target
      if (name != 'o') {
        fail("Targetting multiple datasets is not supported");
      }
    }

    if (opts.source) {
      sources = catalog.findCommandTargets(opts.source);
      if (sources.length > 1 || sources.length == 1 && sources[0].layers.length > 1) {
        fail(utils.format('Source option [%s] matched multiple layers', opts.source));
      } else if (sources.length == 1) {
        source = {dataset: sources[0].dataset, layer: sources[0].layers[0]};
      } else {
        // don't build topology, because:
        //    join -- don't need topology
        //    clip/erase -- topology is built later, when datasets are combined
        sourceDataset = api.importFile(opts.source, utils.defaults({no_topology: true}, opts));
        if (!sourceDataset) {
          fail(utils.format('Unable to find source [%s]', opts.source));
        } else if (sourceDataset.layers.length > 1) {
          fail('Multiple-layer sources are not supported');
        }
        source = {dataset: sourceDataset, layer: sourceDataset.layers[0]};
      }
    }

    if (name == 'cluster') {
      MapShaper.applyCommand(api.cluster, targetLayers, arcs, opts);

    } else if (name == 'calc') {
      MapShaper.applyCommand(api.calc, targetLayers, arcs, opts);

    } else if (name == 'clean') {
      // MapShaper.applyCommand(api.flattenLayer, targetLayers, dataset, opts);
      api.cleanLayers(targetLayers, targetDataset, opts);

    } else if (name == 'clip') {
      outputLayers = api.clipLayers(targetLayers, source, targetDataset, opts);

    } else if (name == 'dissolve') {
      outputLayers = MapShaper.applyCommand(api.dissolve, targetLayers, arcs, opts);

    } else if (name == 'dissolve2') {
      outputLayers = api.dissolve2(targetLayers, targetDataset, opts);
      //outputLayers = MapShaper.applyCommand(api.dissolve2, targetLayers, dataset, opts);

    } else if (name == 'each') {
      MapShaper.applyCommand(api.evaluateEachFeature, targetLayers, arcs, opts.expression, opts);

    } else if (name == 'erase') {
      outputLayers = api.eraseLayers(targetLayers, source, targetDataset, opts);

    } else if (name == 'explode') {
      outputLayers = MapShaper.applyCommand(api.explodeFeatures, targetLayers, arcs, opts);

    } else if (name == 'filter') {
      outputLayers = MapShaper.applyCommand(api.filterFeatures, targetLayers, arcs, opts);

    } else if (name == 'filter-fields') {
      MapShaper.applyCommand(api.filterFields, targetLayers, opts.fields);

    } else if (name == 'filter-islands') {
      MapShaper.applyCommand(api.filterIslands, targetLayers, arcs, opts);

    } else if (name == 'filter-slivers') {
      MapShaper.applyCommand(api.filterSlivers, targetLayers, arcs, opts);

    } else if (name == 'graticule') {
      catalog.addDataset(api.graticule(targetDataset, opts));

    } else if (name == 'i') {
      if (opts.replace) catalog = new Catalog();
      targetDataset = api.importFiles(cmd.options); // kludge to allow layer naming below
      if (targetDataset) {
        catalog.addDataset(targetDataset);
      }

    } else if (name == 'info') {
      catalog.forEachLayer(MapShaper.printLayerInfo);

    } else if (name == 'inspect') {
      MapShaper.applyCommand(api.inspect, targetLayers, arcs, opts);

    } else if (name == 'innerlines') {
      outputLayers = MapShaper.applyCommand(api.innerlines, targetLayers, arcs, opts);

    } else if (name == 'join') {
      MapShaper.applyCommand(api.join, targetLayers, targetDataset, source, opts);

    } else if (name == 'lines') {
      outputLayers = MapShaper.applyCommand(api.lines, targetLayers, arcs, opts);

    } else if (name == 'merge-layers') {
      // careful, returned layers are modified input layers
      if (!opts.target) {
        targetLayers = targetDataset.layers; // kludge
      }
      outputLayers = api.mergeLayers(targetLayers);

    } else if (name == 'o') {
      outputFiles = MapShaper.exportTargetLayers(targets, opts);
      if (opts.final) {
        // don't propagate data if output is final
        catalog = null;
      }
      if (opts.callback) {
        opts.callback(outputFiles);
      } else {
        return MapShaper.writeFiles(outputFiles, opts, done);
      }

    } else if (name == 'point-grid') {
      outputLayers = [api.pointGrid(targetDataset, opts)];
      if (!targetDataset) {
        catalog.addDataset({layers: outputLayers});
      }
    } else if (name == 'points') {
      outputLayers = MapShaper.applyCommand(api.createPointLayer, targetLayers, arcs, opts);

    } else if (name == 'proj') {
      api.proj(targetDataset, opts);

    } else if (name == 'rename-fields') {
      MapShaper.applyCommand(api.renameFields, targetLayers, opts.fields);

    } else if (name == 'rename-layers') {
      api.renameLayers(targetLayers, opts.names);

    } else if (name == 'simplify') {
      api.simplify(targetDataset, opts);

    } else if (name == 'slice') {
      outputLayers = api.sliceLayers(targetLayers, source, targetDataset, opts);

    } else if (name == 'sort') {
      MapShaper.applyCommand(api.sortFeatures, targetLayers, arcs, opts);

    } else if (name == 'split') {
      outputLayers = MapShaper.applyCommand(api.splitLayer, targetLayers, opts.field, opts);

    } else if (name == 'split-on-grid') {
      outputLayers = MapShaper.applyCommand(api.splitLayerOnGrid, targetLayers, arcs, opts);

    } else if (name == 'stitch') {
      api.stitch(targetDataset);

    } else if (name == 'subdivide') {
      outputLayers = MapShaper.applyCommand(api.subdivideLayer, targetLayers, arcs, opts.expression);

    } else if (name == 'svg-style') {
      MapShaper.applyCommand(api.svgStyle, targetLayers, targetDataset, opts);

    } else if (name == 'uniq') {
      MapShaper.applyCommand(api.uniq, targetLayers, arcs, opts);

    } else if (name == 'target') {
      api.target(catalog, opts.layer);

    } else {
      error("Unhandled command: [" + name + "]");
    }

    // apply name parameter
    if ('name' in opts) {
      // TODO: consider uniqifying multiple layers here
      (outputLayers || targetLayers || targetDataset.layers).forEach(function(lyr) {
        lyr.name = opts.name;
      });
    }

    // integrate output layers into the target dataset
    if (outputLayers && targetDataset) {
      if (opts.no_replace) {
        targetDataset.layers = targetDataset.layers.concat(outputLayers);
      } else {
        // TODO: consider replacing old layers as they are generated, for gc
        MapShaper.replaceLayers(targetDataset, targetLayers, outputLayers);
      }
      // use command output as new default target
      catalog.setDefaultTarget(outputLayers, targetDataset);
    }
  } catch(e) {
    return done(e);
  }

  done(null);

  function fail(msg) {
    stop("[" + name + "]", msg);
  }

  function done(err) {
    T.stop('-' + name);
    cb(err, err ? null : catalog);
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
