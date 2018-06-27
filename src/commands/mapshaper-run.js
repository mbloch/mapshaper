
/* @requires mapshaper-include, mapshaper-info */

api.run = function(targets, catalog, opts, cb) {
  var defs, data, commandStr, commands;
  if (targets.length != 1 || targets[0].layers.length != 1) {
    stop("Expected a single target layer");
  }
  internal.include(opts);
  defs = internal.getStateVar('defs');
  if (!opts.function) {
    stop("Expected a \"function\" parameter");
  }
  if (typeof defs[opts.function] != 'function') {
    stop("Expected a function named", opts.function);
  }
  data = internal.getRunCommandData(targets[0]);
  commandStr = defs[opts.function](data);
  commands = internal.parseCommands(commandStr);
  internal.runParsedCommands(commands, catalog, cb);
};

internal.getRunCommandData = function(target) {
  var lyr = target.layers[0];
  var data = internal.getLayerData(lyr, target.dataset);
  data.layer = lyr;
  data.dataset = target.dataset;
  return data;
};
