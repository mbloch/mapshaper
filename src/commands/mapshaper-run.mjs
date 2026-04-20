import { getBaseContext } from '../expressions/mapshaper-expressions';
import { runParsedCommands } from '../cli/mapshaper-run-commands';
import { parseCommands } from '../cli/mapshaper-parse-commands';
import { stop, message, truncateString } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';
import { getIOProxy } from '../expressions/mapshaper-io-proxy';
import { evalTemplateExpression } from '../expressions/mapshaper-template-expressions';
import { commandTakesFileInput } from '../cli/mapshaper-command-info';
import { isPotentialCommandFile } from '../io/mapshaper-file-types';
import { readCommandFile, runCommandFile } from '../cli/mapshaper-run-command-file';

cmd.run = async function(job, targets, opts) {
  var arg = opts.expression;
  if (!arg) {
    stop('-run requires a command file path or a JS expression');
  }
  // Auto-detect a leading argument that looks like a command file (.txt).
  // If detection succeeds, treat as a command file; otherwise the argument
  // is a JS expression (the original -run behavior).
  if (isPotentialCommandFile(arg)) {
    if (opts.target) {
      stop('-run does not accept a target= option for command files');
    }
    await runFromFile(job, arg, opts);
  } else {
    await runFromExpression(job, targets, opts);
  }
};

async function runFromFile(job, file, opts) {
  var content = readCommandFile(file, opts.input);
  if (content === null) {
    stop('Not a mapshaper command file (missing "mapshaper" magic word):', file);
  }
  await runCommandFile(file, content, job, opts);
}

async function runFromExpression(job, targets, opts) {
  var tmp, commands, ctx;
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
    var outputArr = opts && opts.output || null;
    commands.forEach(function(cmd) {
      if (commandTakesFileInput(cmd.name)) {
        cmd.options.input = ctx.io._cache;
      }
      // Forward the output collector to commands that produce output, so a
      // generated -o (or info save_to=, or nested -run) writes into the same
      // output object (e.g. when running under applyCommands).
      if (outputArr && (cmd.name == 'o' || cmd.name == 'run' ||
          cmd.name == 'info' && cmd.options.save_to)) {
        cmd.options.output = outputArr;
      }
    });

    await utils.promisify(runParsedCommands)(commands, job);
  }
}
