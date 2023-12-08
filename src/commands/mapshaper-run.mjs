import { getBaseContext } from '../expressions/mapshaper-expressions';
import { runParsedCommands } from '../cli/mapshaper-run-commands';
import { parseCommands } from '../cli/mapshaper-parse-commands';
import { stop, message, truncateString } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';
import { getIOProxy } from '../expressions/mapshaper-io-proxy';
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
    // truncate message (command might include a large GeoJSON string in an -i command)
    message(`command: [${truncateString(tmp, 150)}]`);
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
