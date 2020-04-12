
import { getLayerData } from '../commands/mapshaper-info';
import { getBaseContext } from '../expressions/mapshaper-expressions';
import { runParsedCommands } from '../cli/mapshaper-run-commands';
import { parseCommands } from '../cli/mapshaper-parse-commands';
import { stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { getStateVar } from '../mapshaper-state';
import cmd from '../mapshaper-cmd';

cmd.run = function(targets, catalog, opts, cb) {
  var commandStr, commands;
  if (opts.include) {
    cmd.include({file: opts.include});
  }
  if (!opts.commands) {
    stop("Missing commands parameter");
  }
  commandStr = runGlobalExpression(opts.commands, targets);
  if (commandStr) {
    commands = parseCommands(commandStr);
    runParsedCommands(commands, catalog, cb);
  } else {
    cb(null);
  }
};

export function runGlobalExpression(expression, targets) {
  var ctx = getBaseContext();
  var output, targetData;
  // TODO: throw an informative error if target is used when there are multiple targets
  if (targets.length == 1) {
    targetData = getRunCommandData(targets[0]);
    Object.defineProperty(ctx, 'target', {value: targetData});
  }
  utils.extend(ctx, getStateVar('defs'));
  try {
    output = Function('ctx', 'with(ctx) {return (' + expression + ');}').call({}, ctx);
  } catch(e) {
    stop(e.name, 'in JS source:', e.message);
  }
  return output;
}


function getRunCommandData(target) {
  var lyr = target.layers[0];
  var data = getLayerData(lyr, target.dataset);
  data.layer = lyr;
  data.dataset = target.dataset;
  return data;
}
