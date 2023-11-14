
import { getBaseContext } from '../expressions/mapshaper-expressions';
import { runParsedCommands } from '../cli/mapshaper-run-commands';
import { parseCommands } from '../cli/mapshaper-parse-commands';
import { stop, message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { getStashedVar } from '../mapshaper-stash';
import cmd from '../mapshaper-cmd';
import { getTargetProxy } from '../expressions/mapshaper-target-proxy';
import { getIOProxy } from '../expressions/mapshaper-job-proxy';
import { commandTakesFileInput } from '../cli/mapshaper-command-info';

cmd.run = async function(job, targets, opts) {
  var tmp, commands;
  if (!opts.expression) {
    stop("Missing expression parameter");
  }

  // io proxy adds ability to add datasets dynamically in a required function
  var ctx = getBaseContext();
  ctx.io = getIOProxy(job);
  tmp = runGlobalExpression(opts.expression, targets, ctx);

  // Support async functions as expressions
  if (utils.isPromise(tmp)) {
    tmp = await tmp;
  }
  if (tmp && !utils.isString(tmp)) {
    stop('Expected a string containing mapshaper commands; received:', tmp);
  }
  if (tmp) {
    message(`command: [${tmp}]`);
    commands = parseCommands(tmp);

    // TODO: remove duplication with mapshaper-run-commands.mjs
    commands.forEach(function(cmd) {
      if (commandTakesFileInput(cmd.name)) {
        cmd.options.input = ctx.io._cache;
      }
    });

    await utils.promisify(runParsedCommands)(commands, job);
  }
};

// This could return a Promise or a value or nothing
export function runGlobalExpression(expression, targets, ctx) {
  ctx = ctx || getBaseContext();
  var output;
  // TODO: throw an informative error if target is used when there are multiple targets
  if (targets && targets.length == 1) {
    Object.defineProperty(ctx, 'target', {value: getTargetProxy(targets[0])});
  }
  // Add defined functions and data to the expression context
  // (Such as functions imported via the -require command)
  utils.extend(ctx, getStashedVar('defs'));
  try {
    output = Function('ctx', 'with(ctx) {return (' + expression + ');}').call({}, ctx);
  } catch(e) {
    stop(e.name, 'in JS source:', e.message);
  }
  return output;
}
