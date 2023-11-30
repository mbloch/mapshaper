import utils from '../utils/mapshaper-utils';
import { error, stop } from '../utils/mapshaper-logging';
import { cleanupArcs, replaceLayers, splitApartLayers } from '../dataset/mapshaper-dataset-utils';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';

// Apply a command to an array of target layers
export function applyCommandToEachLayer(func, targetLayers) {
  var args = utils.toArray(arguments).slice(2);
  var output = targetLayers.reduce(function(memo, lyr) {
    var result = func.apply(null, [lyr].concat(args));
    if (utils.isArray(result)) { // some commands return an array of layers
      memo = memo.concat(result);
    } else if (result) { // assuming result is a layer
      memo.push(result);
    }
    return memo;
  }, []);
  return output.length > 0 ? output : null;
}

export function applyCommandToEachTarget(func, targets) {
  var args = utils.toArray(arguments).slice(2);
  targets.forEach(function(target) {
    var result = func.apply(null, [target].concat(args));
    if (result) {
      error('Unexpected output from command');
    }
  });
}

function isLayer(arg) {
  return arg && (Array.isArray(arg.shapes) || !!arg.data || !!arg.geometry_type);
}

function isArrayOfLayers(arg) {
  return Array.isArray(arg) && arg.every(isLayer);
}

function isDataset(arg) {
  return arg && !!arg.info && Array.isArray(arg.layers);
}

function isTarget(arg) {
  return arg && isDataset(arg.dataset) && isArrayOfLayers(arg.layers);
}

function outputLayersAreDifferent(output, input) {
  return !utils.some(input, function(lyr) {
    return output.indexOf(lyr) > -1;
  });
}

// TODO: use this to postprocess all command output
export function procCommandOutput(output, input, catalog, opts) {
  var inputTarget = isTarget(input) && input ||
    isDataset(input) && {dataset: input, layers: input.layers} ||
    null;

  // standardize output into target format
  var outputTarget = isTarget(output) && output ||
    isLayer(output) && {dataset: inputTarget.dataset, layers: [output]} ||
    isArrayOfLayers(output) && {dataset: inputTarget.dataset, layers: output} ||
    isDataset(output) && {dataset: output, layers: output.layers} ||
    null;

  if (!output) return;
  if (input && !inputTarget) {
    error('Unrecognized command input');
  }
  if (output && !outputTarget) {
    error('Unrecognized command output');
  }

  // apply name parameter
  if (('name' in opts)) {
    // TODO: consider uniqifying multiple layers here
    outputTarget.layers.forEach(function(lyr) {
      lyr.name = opts.name;
    });
  }

  // case: output dataset is different than input dataset
  if (inputTarget && outputTarget.dataset != inputTarget.dataset) {
    catalog.addDataset(outputTarget.dataset); // also sets default target
    if (!opts.no_replace) {
      // delete input layers
      inputTarget.layers.forEach(function(lyr) {
        catalog.deleteLayer(lyr, inputTarget.dataset);
      });
    }
    return;
  }

  if (inputTarget && outputTarget.layers != inputTarget.layers) {
    // integrate output layers into the target dataset
    if (opts.no_replace) {
      // make sure commands do not return input layers with 'no_replace' option
      if (!outputLayersAreDifferent(outputTarget.layers, inputTarget.layers || [])) {
        error('Command returned invalid output');
      }
      // add output layers to target dataset
      outputTarget.dataset.layers =  outputTarget.dataset.layers.concat(outputTarget.layers);
    } else {
      // TODO: consider replacing old layers as they are generated, for gc
      replaceLayers(inputTarget.dataset, inputTarget.layers, outputTarget.layers);
      // some operations leave unreferenced arcs that should be cleaned up
      // TODO: detect arc changes automatically
      if ((name == 'clip' || name == 'erase' || name == 'rectangle' ||
          name == 'rectangles' || name == 'filter' && opts.cleanup) && !opts.no_cleanup) {
        dissolveArcs(inputTarget.dataset);
      }
    }

    if (opts.apart) {
      catalog.setDefaultTargets(splitApartLayers(outputTarget.dataset, outputTarget.layers).map(function(dataset) {
        return {
          dataset: dataset,
          layers: dataset.layers.concat()
        };
      }));
    } else {
      // use command output as new default target
      catalog.setDefaultTarget(outputTarget.layers, outputTarget.dataset);
    }
  }

  // delete arcs if no longer needed (e.g. after -points command)
  // (after output layers have been integrated)
  // TODO: run selectively
  if (inputTarget) {
    cleanupArcs(inputTarget.dataset);
  }

}
