import { cleanupArcs, replaceLayers } from '../dataset/mapshaper-dataset-utils';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';
import { setDatasetCRS, initProjLibrary } from '../geom/mapshaper-projections';
import { getCrsInfo } from '../commands/mapshaper-proj';
import { writeFiles } from '../io/mapshaper-file-export';
import { exportTargetLayers } from '../io/mapshaper-export';
import { expandCommandTargets } from '../dataset/mapshaper-target-utils';
import { getOptionParser } from '../cli/mapshaper-options';
import { convertSourceName, findCommandSource } from '../dataset/mapshaper-source-utils';
import { Catalog, getFormattedLayerList } from '../dataset/mapshaper-catalog';
import { mergeCommandTargets } from '../dataset/mapshaper-merging';
import { T } from '../utils/mapshaper-timing';
import { stop, error, UserError } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';

import '../commands/mapshaper-affine';
import '../commands/mapshaper-buffer';
import '../commands/mapshaper-calc';
import '../commands/mapshaper-clean';
import '../commands/mapshaper-clip-erase';
import '../commands/mapshaper-cluster';
import '../commands/mapshaper-colorizer';
import '../commands/mapshaper-data-fill';
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
import '../commands/mapshaper-filter-slivers';
import '../commands/mapshaper-fuzzy-join';
import '../commands/mapshaper-graticule';
import '../commands/mapshaper-include';
import '../commands/mapshaper-info';
import '../commands/mapshaper-innerlines';
import '../commands/mapshaper-inspect';
import '../commands/mapshaper-join';
import '../commands/mapshaper-lines';
import '../commands/mapshaper-mosaic';
import '../commands/mapshaper-points';
import '../commands/mapshaper-polygon-grid';
import '../commands/mapshaper-point-grid';
import '../commands/mapshaper-polygons';
import '../commands/mapshaper-proj';
import '../commands/mapshaper-rectangle';
import '../commands/mapshaper-rename-layers';
import '../commands/mapshaper-require';
import '../commands/mapshaper-run';
import '../commands/mapshaper-scalebar';
import '../commands/mapshaper-simplify';
import '../commands/mapshaper-sort';
import '../commands/mapshaper-snap';
import '../commands/mapshaper-split';
import '../commands/mapshaper-svg-style';
import '../commands/mapshaper-symbols';
import '../commands/mapshaper-target';
import '../commands/mapshaper-union';
import '../commands/mapshaper-uniq';
import '../io/mapshaper-file-import';
import '../commands/mapshaper-merge-layers';
import '../commands/mapshaper-shape';
import '../simplify/mapshaper-variable-simplify';
import '../commands/mapshaper-split-on-grid';
import '../commands/mapshaper-subdivide';


export function runCommand(command, catalog, cb) {
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
        targets = mergeCommandTargets(targets, catalog);
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
            opts.target, getFormattedLayerList(catalog)));
      }
      if (!(name == 'graticule' || name == 'i' || name == 'help' ||
          name == 'point-grid' || name == 'shape' || name == 'rectangle' ||
          name == 'include')) {
        throw new UserError("No data is available");
      }
    }

    if (opts.source) {
      source = findCommandSource(convertSourceName(opts.source, targets), catalog, opts);
    }

    if (name == 'affine') {
      cmd.affine(targetLayers, targetDataset, opts);

    } else if (name == 'buffer') {
      // applyCommandToEachLayer(cmd.buffer, targetLayers, targetDataset, opts);
      outputLayers = cmd.buffer(targetLayers, targetDataset, opts);

    } else if (name == 'data-fill') {
      applyCommandToEachLayer(cmd.dataFill, targetLayers, arcs, opts);

    } else if (name == 'cluster') {
      applyCommandToEachLayer(cmd.cluster, targetLayers, arcs, opts);

    } else if (name == 'calc') {
      applyCommandToEachLayer(cmd.calc, targetLayers, arcs, opts);

    } else if (name == 'clean') {
      cmd.cleanLayers(targetLayers, targetDataset, opts);

    } else if (name == 'clip') {
      outputLayers = cmd.clipLayers(targetLayers, source, targetDataset, opts);

    } else if (name == 'colorizer') {
      outputLayers = cmd.colorizer(opts);

    } else if (name == 'dissolve') {
      outputLayers = applyCommandToEachLayer(cmd.dissolve, targetLayers, arcs, opts);

    } else if (name == 'dissolve2') {
      outputLayers = cmd.dissolve2(targetLayers, targetDataset, opts);

    } else if (name == 'divide') {
      cmd.divide(targetLayers, targetDataset, source, opts);

    } else if (name == 'dots') {
      outputLayers = applyCommandToEachLayer(cmd.dots, targetLayers, arcs, opts);

    } else if (name == 'drop') {
      cmd.drop2(catalog, targets, opts);
      // cmd.drop(catalog, targetLayers, targetDataset, opts);

    } else if (name == 'each') {
      applyCommandToEachLayer(cmd.evaluateEachFeature, targetLayers, arcs, opts.expression, opts);

    } else if (name == 'erase') {
      outputLayers = cmd.eraseLayers(targetLayers, source, targetDataset, opts);

    } else if (name == 'explode') {
      outputLayers = applyCommandToEachLayer(cmd.explodeFeatures, targetLayers, arcs, opts);

    } else if (name == 'external') {
      cmd.external(opts);

    } else if (name == 'filter') {
      outputLayers = applyCommandToEachLayer(cmd.filterFeatures, targetLayers, arcs, opts);

    } else if (name == 'filter-fields') {
      applyCommandToEachLayer(cmd.filterFields, targetLayers, opts.fields);

    } else if (name == 'filter-geom') {
      applyCommandToEachLayer(cmd.filterGeom, targetLayers, arcs, opts);

    } else if (name == 'filter-islands') {
      applyCommandToEachLayer(cmd.filterIslands, targetLayers, targetDataset, opts);

    } else if (name == 'filter-islands2') {
      applyCommandToEachLayer(cmd.filterIslands2, targetLayers, targetDataset, opts);

    } else if (name == 'filter-slivers') {
      applyCommandToEachLayer(cmd.filterSlivers, targetLayers, targetDataset, opts);

    } else if (name == 'frame') {
      cmd.frame(catalog, source, opts);

    } else if (name == 'fuzzy-join') {
      applyCommandToEachLayer(cmd.fuzzyJoin, targetLayers, arcs, source, opts);

    } else if (name == 'graticule') {
      catalog.addDataset(cmd.graticule(targetDataset, opts));

    } else if (name == 'help') {
      // placing this here to handle errors from invalid command names
      getOptionParser().printHelp(command.options.command);

    } else if (name == 'i') {
      if (opts.replace) catalog = new Catalog();
      targetDataset = cmd.importFiles(command.options);
      if (targetDataset) {
        catalog.addDataset(targetDataset);
        outputLayers = targetDataset.layers; // kludge to allow layer naming below
      }

    } else if (name == 'include') {
      cmd.include(opts);

    } else if (name == 'info') {
      cmd.printInfo(expandCommandTargets(targets));

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
      outputLayers = cmd.mergeLayers(targetLayers, opts);

    } else if (name == 'mosaic') {
      // opts.no_replace = true; // add mosaic as a new layer
      outputLayers = cmd.mosaic(targetLayers, targetDataset, opts);

    } else if (name == 'o') {
      outputFiles = exportTargetLayers(targets, opts);
      if (opts.final) {
        // don't propagate data if output is final
        catalog = null;
      }
      return writeFiles(outputFiles, opts, done);

    } else if (name == 'point-grid') {
      outputLayers = [cmd.pointGrid(targetDataset, opts)];
      if (!targetDataset) {
        catalog.addDataset({layers: outputLayers});
      }

    } else if (name == 'grid') {
      outputDataset = cmd.polygonGrid(targetLayers, targetDataset, opts);

    } else if (name == 'points') {
      outputLayers = applyCommandToEachLayer(cmd.createPointLayer, targetLayers, targetDataset, opts);

    } else if (name == 'polygons') {
      outputLayers = cmd.polygons(targetLayers, targetDataset, opts);

    } else if (name == 'proj') {
      initProjLibrary(opts, function() {
        var err = null;
        try {
          targets.forEach(function(targ) {
            var destArg = opts.match || opts.crs || opts.projection;
            var srcInfo, destInfo;
            if (opts.from) {
              srcInfo = getCrsInfo(opts.from, catalog);
              if (!srcInfo.crs) stop("Unknown projection source:", opts.from);
              setDatasetCRS(targ.dataset, srcInfo);
            }
            if (destArg) {
              destInfo = getCrsInfo(destArg, catalog);
              cmd.proj(targ.dataset, destInfo, opts);
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
        catalog.addDataset(cmd.rectangle(source, opts));
      } else {
        outputLayers = cmd.rectangle2(targets[0], opts);
      }

    } else if (name == 'rectangles') {
      outputLayers = applyCommandToEachLayer(cmd.rectangles, targetLayers, targetDataset, opts);

    } else if (name == 'rename-fields') {
      applyCommandToEachLayer(cmd.renameFields, targetLayers, opts.fields);

    } else if (name == 'rename-layers') {
      cmd.renameLayers(targetLayers, opts.names);

    } else if (name == 'require') {
      cmd.require(targets, opts);

    } else if (name == 'run') {
      cmd.run(targets, catalog, opts, done);
      return;

    } else if (name == 'scalebar') {
      cmd.scalebar(catalog, opts);

    } else if (name == 'shape') {
      catalog.addDataset(cmd.shape(opts));

    } else if (name == 'simplify') {
      if (opts.variable) {
        cmd.variableSimplify(targetLayers, targetDataset, opts);
      } else {
        cmd.simplify(targetDataset, opts);
      }

    } else if (name == 'slice') {
      outputLayers = cmd.sliceLayers(targetLayers, source, targetDataset, opts);

    } else if (name == 'snap') {
      cmd.snap(targetDataset, opts);

    } else if (name == 'sort') {
      applyCommandToEachLayer(cmd.sortFeatures, targetLayers, arcs, opts);

    } else if (name == 'split') {
      outputLayers = applyCommandToEachLayer(cmd.splitLayer, targetLayers, opts.expression, opts);

    } else if (name == 'split-on-grid') {
      outputLayers = applyCommandToEachLayer(cmd.splitLayerOnGrid, targetLayers, arcs, opts);

    } else if (name == 'stitch') {
      cmd.stitch(targetDataset);

    } else if (name == 'style') {
      applyCommandToEachLayer(cmd.svgStyle, targetLayers, targetDataset, opts);

    } else if (name == 'symbols') {
      applyCommandToEachLayer(cmd.symbols, targetLayers, opts);

    } else if (name == 'subdivide') {
      outputLayers = applyCommandToEachLayer(cmd.subdivideLayer, targetLayers, arcs, opts.expression);

    } else if (name == 'target') {
      cmd.target(catalog, opts);

    } else if (name == 'union') {
      outputLayers = cmd.union(targetLayers, targetDataset, opts);

    } else if (name == 'uniq') {
      applyCommandToEachLayer(cmd.uniq, targetLayers, arcs, opts);

    } else {
      // throws error if command is not registered
      cmd.runExternalCommand(command, catalog);
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
      // use command output as new default target
      catalog.setDefaultTarget(outputLayers, targetDataset);
    }



    // delete arcs if no longer needed (e.g. after -points command)
    // (after output layers have been integrated)
    if (targetDataset) {
      cleanupArcs(targetDataset);
    }
  } catch(e) {
    return done(e);
  }

  done(null);

  function done(err) {
    T.stop('-');
    cb(err, err ? null : catalog);
  }
}

function outputLayersAreDifferent(output, input) {
  return !utils.some(input, function(lyr) {
    return output.indexOf(lyr) > -1;
  });
}


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

