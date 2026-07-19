import { parseCommands, parseCommandFileContent } from '../cli/mapshaper-parse-commands';
import { runParsedCommands } from '../cli/mapshaper-run-commands';
import { commandTakesFileInput } from '../cli/mapshaper-command-info';
import {
  isPotentialCommandFile,
  stringLooksLikeCommandFile } from '../io/mapshaper-file-types';
import cli from '../cli/mapshaper-cli-utils';
import { stop, message, verbose } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

// Maximum nesting depth for command files that load other command files
var MAX_RUN_DEPTH = 10;

// Returns the text content of a command file, or null if @file does not look
// like a mapshaper command file (wrong extension or missing magic word).
// On match, the file content is left in the cache so a subsequent reader
// can reuse it.
export function readCommandFile(file, cache) {
  if (!isPotentialCommandFile(file)) return null;
  cli.checkFileExists(file, cache);
  // cli.readFile(... cache) deletes the entry from the cache after reading,
  // so we put it back in case downstream code expects to find it there.
  var content = cli.readFile(file, 'utf8', cache);
  if (!stringLooksLikeCommandFile(content)) {
    if (cache) cache[file] = content;
    return null;
  }
  if (cache) cache[file] = content;
  return content;
}

// Parse and execute the commands in a mapshaper command file within the
// given job. Invoked by the -run command when its argument is a .txt file.
//
// @file: command file path
// @content: command file content (string)
// @job: parent Job object (commands run in this job)
// @opts: options object from the parent -run command (used for input cache and
//   recursion-depth tracking)
//
export async function runCommandFile(file, content, job, opts) {
  var depth = (opts && opts._run_depth || 0) + 1;
  if (depth > MAX_RUN_DEPTH) {
    stop('Command file nesting limit exceeded (' + MAX_RUN_DEPTH + ') at: ' + file);
  }

  var cache = opts && opts.input || null;
  var commandStr;
  try {
    commandStr = parseCommandFileContent(content);
  } catch(e) {
    e.message = 'Error in command file ' + file + ': ' + e.message;
    throw e;
  }

  if (!commandStr) {
    message('Command file contains no commands:', file);
    return;
  }

  verbose('Running command file:', file);

  var commands;
  try {
    commands = parseCommands(commandStr);
    if (opts && opts.validate_commands) {
      opts.validate_commands(commands);
    }
  } catch(e) {
    e.message = 'Error in command file ' + file + ': ' + e.message;
    throw e;
  }

  // Forward the input cache, output array and depth tracker to nested
  // commands. This lets a command file's -i find sibling files in the same
  // cache, lets nested -o commands write to the same output collector (e.g.
  // when running under applyCommands), and lets nested -run commands respect
  // the recursion limit.
  var outputArr = opts && opts.output || null;
  commands.forEach(function(c) {
    if (commandTakesFileInput(c.name) && cache) {
      c.options.input = cache;
    }
    if (outputArr && (c.name == 'o' || c.name == 'i' || c.name == 'run' ||
        c.name == 'info' && c.options.save_to)) {
      c.options.output = outputArr;
    }
    if (c.name == 'run') {
      c.options._run_depth = depth;
      if (opts && opts.validate_commands) {
        c.options.validate_commands = opts.validate_commands;
      }
    }
  });

  await utils.promisify(runParsedCommands)(commands, job);
}
