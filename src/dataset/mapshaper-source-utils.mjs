import { importFile } from '../io/mapshaper-file-import';
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

export function findCommandSource(sourceName, catalog, opts) {
  var source = catalog.findSingleLayer(sourceName);
  var sourceDataset;
  if (!source) {
    // assuming opts.source is a filename
    // don't need to build topology, because:
    //    join -- don't need topology
    //    clip/erase -- topology is built later, when datasets are combined
    sourceDataset = importFile(sourceName, utils.defaults({no_topology: true}, opts));
    if (!sourceDataset) {
      stop(utils.format('Unable to find source [%s]', sourceName));
    } else if (sourceDataset.layers.length > 1) {
      stop('Multiple-layer sources are not supported');
    }
    // mark as disposable to indicate that data can be mutated
    source = {dataset: sourceDataset, layer: sourceDataset.layers[0], disposable: true};
  }
  return source;
}
