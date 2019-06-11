
internal.convertSourceName = function(name, targets) {
  if (!internal.nameIsInterpolated(name)) return name;
  if (targets.length > 1 || targets[0].layers.length != 1) {
    stop("Interpolated names are not compatible with multiple targets.");
  }
  return internal.convertInterpolatedName(name, targets[0].layers[0]);
};

internal.convertInterpolatedName = function(name, lyr) {
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
};

internal.nameIsInterpolated = function(name) {
  return /[$][{]/.test(name);
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
