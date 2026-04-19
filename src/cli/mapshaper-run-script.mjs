import { parseCommands, parseScriptContent } from '../cli/mapshaper-parse-commands';
import { runParsedCommands } from '../cli/mapshaper-run-commands';
import { commandTakesFileInput } from '../cli/mapshaper-command-info';
import {
  isPotentialScriptFile,
  stringLooksLikeScript } from '../io/mapshaper-file-types';
import cli from '../cli/mapshaper-cli-utils';
import { stop, message, verbose } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

// Maximum nesting depth for scripts that load other scripts
var MAX_SCRIPT_DEPTH = 10;

// Returns the text content of a script file, or null if @file does not look
// like a mapshaper script (wrong extension or missing magic word).
// On match, the file content is left in the cache so a subsequent reader
// can reuse it.
export function readScriptFile(file, cache) {
  if (!isPotentialScriptFile(file)) return null;
  cli.checkFileExists(file, cache);
  // cli.readFile(... cache) deletes the entry from the cache after reading,
  // so we put it back in case downstream code expects to find it there.
  var content = cli.readFile(file, 'utf8', cache);
  if (!stringLooksLikeScript(content)) {
    if (cache) cache[file] = content;
    return null;
  }
  if (cache) cache[file] = content;
  return content;
}

// Parse and execute the commands in a mapshaper script file within the
// given job. Used by the CLI -i command when the input file is detected
// as a script.
//
// @file: script file path
// @content: script file content (string)
// @job: parent Job object (script commands run in this job)
// @opts: options object from the parent -i command (used for input cache and
//   recursion-depth tracking)
//
export async function runScriptFile(file, content, job, opts) {
  var depth = (opts && opts._script_depth || 0) + 1;
  if (depth > MAX_SCRIPT_DEPTH) {
    stop('Script nesting limit exceeded (' + MAX_SCRIPT_DEPTH + ') at: ' + file);
  }

  var cache = opts && opts.input || null;
  var commandStr;
  try {
    commandStr = parseScriptContent(content);
  } catch(e) {
    e.message = 'Error in script ' + file + ': ' + e.message;
    throw e;
  }

  if (!commandStr) {
    message('Script contains no commands:', file);
    return;
  }

  verbose('Running script:', file);

  var commands;
  try {
    commands = parseCommands(commandStr);
  } catch(e) {
    e.message = 'Error in script ' + file + ': ' + e.message;
    throw e;
  }

  // Forward the input cache, output array and depth tracker to nested
  // commands. This lets a script-loaded -i find sibling files in the same
  // cache, lets nested -o commands write to the same output collector
  // (e.g. when running under applyCommands), and lets nested -i scripts
  // respect the recursion limit.
  var outputArr = opts && opts.output || null;
  commands.forEach(function(c) {
    if (commandTakesFileInput(c.name) && cache) {
      c.options.input = cache;
    }
    if (outputArr && (c.name == 'o' || c.name == 'i' ||
        c.name == 'info' && c.options.save_to)) {
      c.options.output = outputArr;
    }
    if (c.name == 'i') {
      c.options._script_depth = depth;
    }
  });

  await utils.promisify(runParsedCommands)(commands, job);
}
