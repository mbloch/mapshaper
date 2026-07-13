import { importDatasetsFromFile } from '../io/mapshaper-file-import';
import { stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

export function convertSourceName(name, targets) {
  if (!nameIsInterpolated(name)) return name;
  if (targets.length > 1 || targets[0].layers.length != 1) {
    stop("Interpolated names are not compatible with multiple targets.");
  }
  return convertInterpolatedName(name, targets[0].layers[0]);
}

export function convertInterpolatedName(name, lyr) {
  var ctx = {target: lyr.name || ''};
  var body = 'with($$ctx) { return `' + name + '`; }';
  var func;
  try {
    func = new Function("$$ctx", body);
    name = func(ctx);
  } catch(e) {
    stop("Unable to interpolate [" + name + "]");
  }
  return name;
}

function nameIsInterpolated(name) {
  return /[$][{]/.test(name);
}

export async function findCommandSourceAsync(sourceName, catalog, opts) {
  var source = catalog.findSingleLayer(sourceName);
  var sourceDatasets;
  if (!source) {
    // Source-file topology is built later if it is needed by the command.
    sourceDatasets = await importDatasetsFromFile(sourceName, utils.defaults({no_topology: true}, opts));
    source = getImportedSource(sourceDatasets, sourceName);
  }
  return source;
}

function getImportedSource(sourceDatasets, sourceName) {
  if (sourceDatasets.length != 1) {
    if (sourceDatasets.length > 1) {
      stop('Multiple-dataset sources are not supported');
    }
    stop(utils.format('Unable to find source [%s]', sourceName));
  }
  var sourceDataset = sourceDatasets[0];
  if (sourceDataset.layers.length > 1) {
    stop('Multiple-layer sources are not supported');
  }
  // mark as disposable to indicate that data can be mutated
  return {dataset: sourceDataset, layer: sourceDataset.layers[0], disposable: true};
}
