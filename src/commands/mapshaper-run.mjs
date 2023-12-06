import { getBaseContext } from '../expressions/mapshaper-expressions';
import { runParsedCommands } from '../cli/mapshaper-run-commands';
import { parseCommands } from '../cli/mapshaper-parse-commands';
import { stop, message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';
import { getIOProxy } from '../expressions/mapshaper-job-proxy';
import { evalTemplateExpression } from '../expressions/mapshaper-template-expressions';
import { commandTakesFileInput } from '../cli/mapshaper-command-info';

cmd.run = async function(job, targets, opts) {
  var tmp, commands, ctx;
  if (!opts.expression) {
    stop("Missing expression parameter");
  }
  ctx = getBaseContext();
  // io proxy adds ability to add datasets dynamically in a required function
  ctx.io = getIOProxy(job);
  tmp = await evalTemplateExpression(opts.expression, targets, ctx);
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
