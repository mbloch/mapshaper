import { cleanupArcs, replaceLayers, splitApartLayers } from '../dataset/mapshaper-dataset-utils';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';
import { initProjLibrary } from '../crs/mapshaper-projections';
import { writeFiles } from '../io/mapshaper-file-export';
import { exportTargetLayers } from '../io/mapshaper-export';
import { getOptionParser } from '../cli/mapshaper-options';
import { convertSourceName, findCommandSource } from '../dataset/mapshaper-source-utils';
import { Catalog, getFormattedLayerList } from '../dataset/mapshaper-catalog';
import { Job } from '../mapshaper-job';
import { mergeCommandTargets } from '../dataset/mapshaper-merging';
import { T } from '../utils/mapshaper-timing';
import { stop, error, UserError, verbose } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';
import { stashVar, clearStash } from '../mapshaper-stash';
import { applyCommandToEachLayer, applyCommandToEachTarget } from '../cli/mapshaper-command-utils';

import '../commands/mapshaper-add-shape';
import '../commands/mapshaper-affine';
import '../commands/mapshaper-alpha-shapes';
import '../commands/mapshaper-buffer';
import '../commands/mapshaper-calc';
import '../commands/mapshaper-classify';
import '../commands/mapshaper-clean';
import '../commands/mapshaper-clip-erase';
import '../commands/mapshaper-cluster';
import '../commands/mapshaper-colorizer';
import '../commands/mapshaper-comment';
import '../commands/mapshaper-dashlines';
import '../commands/mapshaper-data-fill';
import '../commands/mapshaper-define';
import '../commands/mapshaper-dissolve';
import '../commands/mapshaper-dissolve2';
import '../commands/mapshaper-divide';
import '../commands/mapshaper-dots';
import '../commands/mapshaper-drop';
import '../commands/mapshaper-each';
import '../commands/mapshaper-explode';
import '../io/mapshaper-export';
import '../commands/mapshaper-external';
import '../commands/mapshaper-frame';
import '../commands/mapshaper-filter';
import '../commands/mapshaper-filter-geom';
import '../commands/mapshaper-filter-islands';
import '../commands/mapshaper-filter-islands2';
import '../commands/mapshaper-filter-rename-fields';
import '../commands/mapshaper-filter-points';
import '../commands/mapshaper-filter-slivers';
import '../commands/mapshaper-fuzzy-join';
import '../commands/mapshaper-graticule';
import '../commands/mapshaper-help';
import { skipCommand } from '../commands/mapshaper-if-elif-else-endif';
import '../commands/mapshaper-ignore';
import '../commands/mapshaper-include';
import '../commands/mapshaper-info';
import '../commands/mapshaper-inlay';
import '../commands/mapshaper-innerlines';
import '../commands/mapshaper-inspect';
import '../commands/mapshaper-join';
import '../commands/mapshaper-lines';
import '../commands/mapshaper-mosaic';
import '../commands/mapshaper-points';
import '../commands/mapshaper-polygon-grid';
import '../commands/mapshaper-point-grid';
import '../commands/mapshaper-point-to-grid';
import '../commands/mapshaper-polygons';
import '../commands/mapshaper-print';
import '../commands/mapshaper-proj';
import '../commands/mapshaper-rectangle';
import '../commands/mapshaper-rename-layers';
import '../commands/mapshaper-require';
import '../commands/mapshaper-rotate';
import '../commands/mapshaper-run';
import '../commands/mapshaper-scalebar';
import '../commands/mapshaper-shape';
import '../commands/mapshaper-simplify';
import '../commands/mapshaper-sort';
import '../commands/mapshaper-snap';
import '../commands/mapshaper-split';
import '../commands/mapshaper-stop';
import '../commands/mapshaper-svg-style';
import '../commands/mapshaper-symbols';
import '../commands/mapshaper-target';
import '../commands/mapshaper-union';
import '../commands/mapshaper-uniq';
import '../io/mapshaper-file-import';
import '../commands/mapshaper-merge-layers';
import '../simplify/mapshaper-variable-simplify';
import '../commands/mapshaper-split-on-grid';
import '../commands/mapshaper-subdivide';

function commandAcceptsMultipleTargetDatasets(name) {
  return name == 'rotate' || name == 'info' || name == 'proj' || name == 'require' ||
    name == 'drop' || name == 'target' || name == 'if' || name == 'elif' ||
    name == 'else' || name == 'endif' || name == 'run' || name == 'i' || name == 'snap';
}

function commandAcceptsEmptyTarget(name) {
  return name == 'graticule' || name == 'i' || name == 'help' ||
    name == 'point-grid' || name == 'shape' || name == 'rectangle' ||
    name == 'require' || name == 'run' || name == 'define' ||
    name == 'include' || name == 'print' || name == 'comment' || name == 'if' || name == 'elif' ||
    name == 'else' || name == 'endif' || name == 'stop' || name == 'add-shape';
}

export async function runCommand(command, job) {
  var name = command.name,
      opts = command.options,
      source,
      outputDataset,
      outputLayers,
      outputFiles,
      targets,
      targetDataset,
      targetLayers,
      arcs;

  if (skipCommand(name, job)) {
    return done(null);
  }

  if (!job) job = new Job();
  job.startCommand(command);

  try { // catch errors from synchronous functions
    T.start();

    if (name == 'rename-layers') {
      // default target is all layers
      targets = job.catalog.findCommandTargets(opts.target || '*');
      targetLayers = targets.reduce(function(memo, obj) {
        return memo.concat(obj.layers);
      }, []);

    } else if (name == 'o') {
      // when combining GeoJSON layers, default is all layers
      // TODO: check that combine_layers is only used w/ GeoJSON output
      targets = job.catalog.findCommandTargets(opts.target || opts.combine_layers && '*');

    } else if (commandAcceptsMultipleTargetDatasets(name)) {
      targets = job.catalog.findCommandTargets(opts.target);

    } else {
      targets = job.catalog.findCommandTargets(opts.target);
      // special case to allow -merge-layers and -union to combine layers from multiple datasets
      // TODO: support multi-dataset targets for other commands
      if (targets.length > 1 && (name == 'merge-layers' || name == 'union')) {
        targets = mergeCommandTargets(targets, job.catalog);
      }

      if (targets.length == 1) {
        targetDataset = targets[0].dataset;
        arcs = targetDataset.arcs;
        targetLayers = targets[0].layers;
        // target= option sets default target
        job.catalog.setDefaultTarget(targetLayers, targetDataset);

      } else if (targets.length > 1) {
        stop("This command does not support targetting layers from different datasets");
      }
    }

    if (targets.length === 0) {
      if (opts.target) {
        stop(utils.format('Missing target: %s\nAvailable layers: %s',
            opts.target, getFormattedLayerList(job.catalog)));
      }
      if (!commandAcceptsEmptyTarget(name)) {
        throw new UserError("No data is available");
      }
    }

    if (opts.source) {
      source = findCommandSource(convertSourceName(opts.source, targets), job.catalog, opts);
    }

    // identify command target/input (for postprocessing)
    // TODO: support commands with multiple target datasets
    // target = name == 'i' ? null : targets[0];

    if (name == 'add-shape') {
      if (!targetDataset) {
        targetDataset = {info: {}, layers: []};
        targetLayers = targetDataset.layers;
        job.catalog.addDataset(targetDataset);
      }
      outputLayers = cmd.addShape(targetLayers, targetDataset, opts);
    } else if (name == 'affine') {
      cmd.affine(targetLayers, targetDataset, opts);

    } else if (name == 'alpha-shapes') {
      outputLayers = applyCommandToEachLayer(cmd.alphaShapes, targetLayers, targetDataset, opts);
      // outputLayers = null;

    } else if (name == 'buffer') {
       outputLayers = applyCommandToEachLayer(cmd.buffer, targetLayers, targetDataset, opts);
      // outputLayers = cmd.buffer(targetLayers, targetDataset, opts);

    } else if (name == 'data-fill') {
      applyCommandToEachLayer(cmd.dataFill, targetLayers, arcs, opts);

    } else if (name == 'cluster') {
      applyCommandToEachLayer(cmd.cluster, targetLayers, arcs, opts);

    } else if (name == 'calc') {
      outputDataset = cmd.calc(targetLayers, arcs, opts);

    } else if (name == 'classify') {
      applyCommandToEachLayer(cmd.classify, targetLayers, targetDataset, opts);

    } else if (name == 'clean') {
      cmd.cleanLayers(targetLayers, targetDataset, opts);

    } else if (name == 'clip') {
      outputLayers = cmd.clipLayers(targetLayers, source, targetDataset, opts);

    } else if (name == 'colorizer') {
      outputLayers = cmd.colorizer(opts);

    } else if (name == 'comment') {
      // no-op

    } else if (name == 'dashlines') {
      applyCommandToEachLayer(cmd.dashlines, targetLayers, targetDataset, opts);

    } else if (name == 'define') {
      cmd.define(job.catalog, opts);

    } else if (name == 'dissolve') {
      outputLayers = applyCommandToEachLayer(cmd.dissolve, targetLayers, arcs, opts);

    } else if (name == 'dissolve2') {
      outputLayers = cmd.dissolve2(targetLayers, targetDataset, opts);

    } else if (name == 'divide') {
      cmd.divide(targetLayers, targetDataset, source, opts);

    } else if (name == 'dots') {
      outputLayers = applyCommandToEachLayer(cmd.dots, targetLayers, arcs, opts);

    } else if (name == 'drop') {
      cmd.drop2(job.catalog, targets, opts);
      // cmd.drop(catalog, targetLayers, targetDataset, opts);

    } else if (name == 'each') {
      applyCommandToEachLayer(cmd.evaluateEachFeature, targetLayers, targetDataset, opts.expression, opts);

    } else if (name == 'erase') {
      outputLayers = cmd.eraseLayers(targetLayers, source, targetDataset, opts);

    } else if (name == 'explode') {
      outputLayers = applyCommandToEachLayer(cmd.explodeFeatures, targetLayers, arcs, opts);

    // -require now incorporates functionality of -external
    // } else if (name == 'external') {
    //   cmd.require(targets, opts);

    } else if (name == 'filter') {
      outputLayers = applyCommandToEachLayer(cmd.filterFeatures, targetLayers, arcs, opts);

    } else if (name == 'filter-fields') {
      applyCommandToEachLayer(cmd.filterFields, targetLayers, opts.fields, opts);

    } else if (name == 'filter-geom') {
      applyCommandToEachLayer(cmd.filterGeom, targetLayers, arcs, opts);

    } else if (name == 'filter-islands') {
      applyCommandToEachLayer(cmd.filterIslands, targetLayers, targetDataset, opts);

    } else if (name == 'filter-islands2') {
      applyCommandToEachLayer(cmd.filterIslands2, targetLayers, targetDataset, opts);

    } else if (name == 'filter-points') {
      applyCommandToEachLayer(cmd.filterPoints, targetLayers, targetDataset, opts);

    } else if (name == 'filter-slivers') {
      applyCommandToEachLayer(cmd.filterSlivers, targetLayers, targetDataset, opts);

    } else if (name == 'frame') {
      cmd.frame(job.catalog, source, opts);

    } else if (name == 'fuzzy-join') {
      applyCommandToEachLayer(cmd.fuzzyJoin, targetLayers, arcs, source, opts);

    } else if (name == 'graticule') {
      job.catalog.addDataset(cmd.graticule(targetDataset, opts));

    } else if (name == 'grid') {
      outputDataset = cmd.polygonGrid(targetLayers, targetDataset, opts);

    } else if (name == 'grid2') {
      outputDataset = cmd.polygonGrid2(targetLayers, targetDataset, opts);

    } else if (name == 'help') {
      // placing help command here to handle errors from invalid command names
      cmd.printHelp(command.options);

    } else if (name == 'i') {
      if (opts.replace) job.catalog = new Catalog(); // is this what we want?
      targetDataset = await cmd.importFiles(job.catalog, command.options);
      if (targetDataset) {
        outputLayers = targetDataset.layers; // kludge to allow layer naming below
      }

    } else if (name == 'if' || name == 'elif') {
      // target = findSingleTargetLayer(opts.layer, targets[0], catalog);
      // cmd[name](target.layer, target.dataset, opts);
      cmd[name](job, opts);

    } else if (name == 'else' || name == 'endif') {
      cmd[name](job);

    } else if (name == 'ignore') {
      applyCommandToEachLayer(cmd.ignore, targetLayers, targetDataset, opts);

    } else if (name == 'include') {
      cmd.include(opts);

    } else if (name == 'info') {
      outputDataset = cmd.info(targets, opts);

    } else if (name == 'inlay') {
      outputLayers = cmd.inlay(targetLayers, source, targetDataset, opts);

    } else if (name == 'inspect') {
      applyCommandToEachLayer(cmd.inspect, targetLayers, arcs, opts);

    } else if (name == 'innerlines') {
      outputLayers = applyCommandToEachLayer(cmd.innerlines, targetLayers, arcs, opts);

    } else if (name == 'join') {
      applyCommandToEachLayer(cmd.join, targetLayers, targetDataset, source, opts);

    } else if (name == 'lines') {
      outputLayers = applyCommandToEachLayer(cmd.lines, targetLayers, targetDataset, opts);

    } else if (name == 'merge-layers') {
      // returned layers are modified input layers
      // (assumes that targetLayers are replaced by outputLayers below)
      outputLayers = cmd.mergeAndFlattenLayers(targetLayers, targetDataset, opts);
      // outputLayers = cmd.mergeLayers(targetLayers, opts);

    } else if (name == 'mosaic') {
      // opts.no_replace = true; // add mosaic as a new layer
      outputLayers = cmd.mosaic(targetLayers, targetDataset, opts);

    } else if (name == 'o') {
      outputFiles = await exportTargetLayers(targets, opts);
      if (opts.final) {
        // don't propagate data if output is final
        //// catalog = null;
        job.catalog = new Catalog();
      }
      await utils.promisify(writeFiles)(outputFiles, opts);

    } else if (name == 'point-grid') {
      outputLayers = [cmd.pointGrid(targetDataset, opts)];
      if (!targetDataset) {
        job.catalog.addDataset({layers: outputLayers});
      }

    } else if (name == 'point-to-grid') {
      outputLayers = cmd.pointToGrid(targetLayers, targetDataset, opts);

    } else if (name == 'points') {
      outputLayers = applyCommandToEachLayer(cmd.createPointLayer, targetLayers, targetDataset, opts);

    } else if (name == 'polygons') {
      outputLayers = cmd.polygons(targetLayers, targetDataset, opts);

    } else if (name == 'print') {
      cmd.print(command._.join(' '));

    } else if (name == 'proj') {
      await initProjLibrary(opts);
      job.resumeCommand();
      targets.forEach(function(targ) {
        cmd.proj(targ.dataset, job.catalog, opts);
      });

    } else if (name == 'rectangle') {
      if (source || opts.bbox || targets.length === 0) {
        job.catalog.addDataset(cmd.rectangle(source, opts));
      } else {
        outputLayers = cmd.rectangle2(targets[0], opts);
      }

    } else if (name == 'rectangles') {
      outputLayers = applyCommandToEachLayer(cmd.rectangles, targetLayers, targetDataset, opts);

    } else if (name == 'rename-fields') {
      applyCommandToEachLayer(cmd.renameFields, targetLayers, opts.fields);

    } else if (name == 'rename-layers') {
      cmd.renameLayers(targetLayers, opts.names, job.catalog);

    } else if (name == 'require') {
      await cmd.require(opts);

    } else if (name == 'rotate') {
      targets.forEach(function(targ) {
        cmd.rotate(targ.dataset, opts);
      });

    } else if (name == 'run') {
      await cmd.run(job, targets, opts);

    } else if (name == 'scalebar') {
      cmd.scalebar(job.catalog, opts);

    } else if (name == 'shape') {
      job.catalog.addDataset(cmd.shape(targetDataset, opts));

    } else if (name == 'shapes') {
      outputLayers = applyCommandToEachLayer(cmd.shapes, targetLayers, targetDataset, opts);

    } else if (name == 'simplify') {
      if (opts.variable) {
        cmd.variableSimplify(targetLayers, targetDataset, opts);
      } else {
        cmd.simplify(targetDataset, opts);
      }

    } else if (name == 'slice') {
      outputLayers = cmd.sliceLayers(targetLayers, source, targetDataset, opts);

    } else if (name == 'snap') {
      // cmd.snap(targetDataset, opts);
      applyCommandToEachTarget(cmd.snap, targets, opts);

    } else if (name == 'sort') {
      applyCommandToEachLayer(cmd.sortFeatures, targetLayers, arcs, opts);

    } else if (name == 'split') {
      outputLayers = applyCommandToEachLayer(cmd.splitLayer, targetLayers, opts.expression, opts);

    } else if (name == 'stop') {
      cmd.stop(job);

    } else if (name == 'split-on-grid') {
      outputLayers = applyCommandToEachLayer(cmd.splitLayerOnGrid, targetLayers, arcs, opts);

    } else if (name == 'stitch') {
      cmd.stitch(targetDataset);

    } else if (name == 'style') {
      applyCommandToEachLayer(cmd.svgStyle, targetLayers, targetDataset, opts);

    } else if (name == 'symbols') {
      outputLayers = applyCommandToEachLayer(cmd.symbols, targetLayers, targetDataset, opts);

    } else if (name == 'subdivide') {
      outputLayers = applyCommandToEachLayer(cmd.subdivideLayer, targetLayers, arcs, opts.expression);

    } else if (name == 'target') {
      cmd.target(job.catalog, opts);

    } else if (name == 'union') {
      outputLayers = cmd.union(targetLayers, targetDataset, opts);

    } else if (name == 'uniq') {
      applyCommandToEachLayer(cmd.uniq, targetLayers, arcs, opts);

    } else {
      // throws error if command is not registered
      cmd.runExternalCommand(command, job.catalog);
    }

    // apply name parameter
    if (('name' in opts) && outputLayers) {
      // TODO: consider uniqifying multiple layers here
      outputLayers.forEach(function(lyr) {
        lyr.name = opts.name;
      });
    }

    if (outputDataset) {
      job.catalog.addDataset(outputDataset); // also sets default target
      outputLayers = outputDataset.layers;
      if (targetLayers && !opts.no_replace) {
        // remove target layers from target dataset
        targetLayers.forEach(function(lyr) {
          job.catalog.deleteLayer(lyr, targetDataset);
        });
      }
    } else if (outputLayers && targetDataset && outputLayers != targetDataset.layers) {
      // integrate output layers into the target dataset
      if (opts.no_replace) {
        // make sure commands do not return input layers with 'no_replace' option
        if (!outputLayersAreDifferent(outputLayers, targetLayers || [])) {
          error('Command returned invalid output');
        }

        targetDataset.layers = targetDataset.layers.concat(outputLayers);
      } else {
        // TODO: consider replacing old layers as they are generated, for gc
        replaceLayers(targetDataset, targetLayers, outputLayers);
        // some operations leave unreferenced arcs that should be cleaned up
        if ((name == 'clip' || name == 'erase' || name == 'rectangle' ||
            name == 'rectangles' || name == 'filter' && opts.cleanup) && !opts.no_cleanup) {
          dissolveArcs(targetDataset);
        }
      }

      if (opts.apart) {
        job.catalog.setDefaultTargets(splitApartLayers( targetDataset, outputLayers).map(function(dataset) {
          return {
            dataset: dataset,
            layers: dataset.layers.concat()
          };
        }));
      } else {
        // use command output as new default target
        job.catalog.setDefaultTarget(outputLayers, targetDataset);
      }
    }

    // delete arcs if no longer needed (e.g. after -points command)
    // (after output layers have been integrated)
    // TODO: be more selective (e.g. -i command doesn't need cleanup)
    //   or: detect if arcs have been changed
    if (targetDataset) {
      cleanupArcs(targetDataset);
    }

  } catch(e) {
    return done(e);
  }

  // non-erroring synchronous commands are done
  return done(null);

  function done(err) {
    job.endCommand();
    verbose('-', T.stop());
    if (err) throw err;
    return job;
  }
}

function outputLayersAreDifferent(output, input) {
  return !utils.some(input, function(lyr) {
    return output.indexOf(lyr) > -1;
  });
}
