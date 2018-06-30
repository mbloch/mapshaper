
/* @requires mapshaper-include, mapshaper-info */

api.run = function(targets, catalog, opts, cb) {
  var commandStr, commands;
  if (opts.include) {
    internal.include({file: opts.include});
  }
  if (!opts.commands) {
    stop("Missing commands parameter");
  }
  commandStr = internal.runGlobalExpression(opts.commands, targets);
  if (commandStr) {
    commands = internal.parseCommands(commandStr);
    internal.runParsedCommands(commands, catalog, cb);
  } else {
    cb(null);
  }
};

internal.runGlobalExpression = function(expression, targets) {
  var ctx = internal.getBaseContext();
  var output, targetData;
  // TODO: throw an informative error if target is used when there are multiple targets
  if (targets.length == 1) {
    targetData = internal.getRunCommandData(targets[0]);
    Object.defineProperty(ctx, 'target', {value: targetData});
  }
  utils.extend(ctx, internal.getStateVar('defs'));
  try {
    output = Function('ctx', 'with(ctx) {return (' + expression + ');}').call({}, ctx);
  } catch(e) {
    stop(e.name, 'in JS source:', e.message);
  }
  return output;
};


internal.getRunCommandData = function(target) {
  var lyr = target.layers[0];
  var data = internal.getLayerData(lyr, target.dataset);
  data.layer = lyr;
  data.dataset = target.dataset;
  return data;
};
