import cmd from '../mapshaper-cmd';
import { stop } from '../utils/mapshaper-logging';
import { mergeDatasets } from '../dataset/mapshaper-merging';

cmd.target = function(catalog, opts) {
  var type = (opts.type || '').toLowerCase().replace('linestring', 'polyline');
  var pattern = opts.target || '*';
  var targets = catalog.findCommandTargets(pattern, type);
  if (type && 'polygon,polyline,point'.split(',').indexOf(type) == -1) {
    stop("Invalid layer type:", opts.type);
  }
  if (targets.length === 0) {
    stop("No layers were matched (pattern: " + pattern + (type ? ' type: ' + type : '') + ")");
  }
  if (opts.name || opts.name === '') {
    // TODO: improve this
    targets[0].layers[0].name = opts.name;
  }
  if (opts.combine) {
    targets = combineTargets(targets, catalog);
  } else if (opts.isolate) {
    targets = isolateTargets(targets, catalog);
  }
  catalog.setDefaultTargets(targets);
};

function combineTargets(targets, catalog) {
  var datasets = [];
  var layers = [];
  targets.forEach(function(o) {
    datasets.push(o.dataset);
    catalog.removeDataset(o.dataset);
    layers = layers.concat(o.layers);
  });
  var combined = mergeDatasets(datasets);
  catalog.addDataset(combined);
  return [{
    dataset: combined,
    layers: layers
  }];
}

function isolateTargets(targets, catalog) {
  var datasets = [];
  var layers = [];
  targets.forEach(function(o) {
    var dataset =
    datasets.push(o.dataset);
    o.layers.forEach(function(lyr) {
      catalog.removeLayer(lyr, o.dataset);
      layers.push(lyr);

    });
  });
}
