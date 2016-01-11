/* @requires
mapshaper-clip-erase
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
mapshaper-info
mapshaper-innerlines
mapshaper-join
mapshaper-keep-shapes
mapshaper-stitch
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
      outputLayers,
      outputFiles,
      arcs;

  try { // catch errors from synchronous functions

    T.start();
    if (dataset) {
      arcs = dataset.arcs;
      if (dataset.layers.length > 0 === false) {
        error("Dataset contains 0 layers");
      }


      if (opts.target) {
        targetLayers = MapShaper.findMatchingLayers(dataset.layers, opts.target);
        if (!targetLayers.length) {
          stop(utils.format('[%s] Missing target layer: %s\nAvailable layers: %s',
            name, opts.target, MapShaper.getFormattedLayerList(dataset.layers)));
        }
      } else {
        targetLayers = dataset.layers; // default: all layers
      }
    }

    if (name == 'calc') {
      MapShaper.applyCommand(api.calc, targetLayers, arcs, opts);

    } else if (name == 'clip') {
      outputLayers = api.clipLayers(targetLayers, opts.source, dataset, opts);

    } else if (name == 'dissolve') {
      outputLayers = MapShaper.applyCommand(api.dissolve, targetLayers, arcs, opts);

    } else if (name == 'dissolve2') {
      outputLayers = MapShaper.applyCommand(api.dissolvePolygons2, targetLayers, dataset, opts);

    } else if (name == 'each') {
      MapShaper.applyCommand(api.evaluateEachFeature, targetLayers, arcs, opts.expression, opts);

    } else if (name == 'erase') {
      outputLayers = api.eraseLayers(targetLayers, opts.source, dataset, opts);

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

    } else if (name == 'flatten') {
      outputLayers = MapShaper.applyCommand(api.flattenLayer, targetLayers, dataset, opts);

    } else if (name == 'i') {
      dataset = api.importFiles(cmd.options);

    } else if (name == 'info') {
      api.printInfo(dataset);

    } else if (name == 'innerlines') {
      outputLayers = MapShaper.applyCommand(api.convertPolygonsToInnerLines, targetLayers, arcs, opts);

    } else if (name == 'join') {
      MapShaper.applyCommand(api.join, targetLayers, dataset, opts);

    } else if (name == 'layers') {
      outputLayers = MapShaper.applyCommand(api.filterLayers, dataset.layers, opts.layers);

    } else if (name == 'lines') {
      outputLayers = MapShaper.applyCommand(api.convertPolygonsToTypedLines, targetLayers, arcs, opts.fields, opts);

    } else if (name == 'stitch') {
      api.stitch(dataset);

    } else if (name == 'merge-layers') {
      // careful, returned layers are modified input layers
      outputLayers = api.mergeLayers(targetLayers);

    } else if (name == 'o') {
      outputFiles = MapShaper.exportFileContent(utils.defaults({layers: targetLayers}, dataset), opts);
      if (opts.__nowrite) {
        done(null, outputFiles);
      } else {
        MapShaper.writeFiles(outputFiles, opts, done);
      }
      return;

    } else if (name == 'points') {
      outputLayers = MapShaper.applyCommand(api.createPointLayer, targetLayers, arcs, opts);

    } else if (name == 'proj') {
      api.proj(dataset, opts);

    } else if (name == 'rename-fields') {
      MapShaper.applyCommand(api.renameFields, targetLayers, opts.fields);

    } else if (name == 'rename-layers') {
      api.renameLayers(targetLayers, opts.names);

    } else if (name == 'repair') {
      outputLayers = MapShaper.repairPolygonGeometry(targetLayers, dataset, opts);

    } else if (name == 'simplify') {
      api.simplify(dataset, opts);

    } else if (name == 'sort') {
      MapShaper.applyCommand(api.sortFeatures, targetLayers, arcs, opts);

    } else if (name == 'split') {
      outputLayers = MapShaper.applyCommand(api.splitLayer, targetLayers, opts.field, opts);

    } else if (name == 'split-on-grid') {
      outputLayers = MapShaper.applyCommand(api.splitLayerOnGrid, targetLayers, arcs, opts.rows, opts.cols);

    } else if (name == 'subdivide') {
      outputLayers = MapShaper.applyCommand(api.subdivideLayer, targetLayers, arcs, opts.expression);

    } else {
      error("Unhandled command: [" + name + "]");
    }

    // apply name parameter
    if ('name' in opts) {
      // TODO: consider uniqifying multiple layers here
      (outputLayers || targetLayers || dataset.layers).forEach(function(lyr) {
        lyr.name = opts.name;
      });
    }

    // integrate output layers into the dataset
    if (outputLayers) {
      if (opts.no_replace) {
        dataset.layers = dataset.layers.concat(outputLayers);
      } else {
        // TODO: consider replacing old layers as they are generated, for gc
        MapShaper.replaceLayers(dataset, targetLayers, outputLayers);
      }
    }
  } catch(e) {
    done(e);
    return;
  }

  done(null);

  function done(err, output) {
    T.stop('-' + name);
    cb(err, err ? null : output || dataset);
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

MapShaper.getFormattedLayerList = function(layers) {
  return layers.reduce(function(memo, lyr, i) {
    return memo + '\n  [' + i + ']  ' + (lyr.name || '[unnamed]');
  }, '') || '[none]';
};
