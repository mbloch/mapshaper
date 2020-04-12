import { getOptionParser } from '../cli/mapshaper-options';
import { splitShellTokens } from '../cli/mapshaper-option-parsing-utils';
import { stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

// Parse an array or a string of command line tokens into an array of
// command objects.
export function parseCommands(tokens) {
  if (Array.isArray(tokens) && utils.isObject(tokens[0])) {
    // argv seems to contain parsed commands already... make a copy
    return tokens.map(function(cmd) {
      return {name: cmd.name, options: Object.assign({}, cmd.options)};
    });
  }
  if (utils.isString(tokens)) {
    tokens = splitShellTokens(tokens);
  }
  return getOptionParser().parseArgv(tokens);
}

export function standardizeConsoleCommands(raw) {
  var str = raw.replace(/^mapshaper\b/, '').trim();
  if (/^[a-z]/.test(str)) {
    // add hyphen prefix to bare command
    str = '-' + str;
  }
  return str;
}

// Parse a command line string for the browser console
export function parseConsoleCommands(raw) {
  var blocked = ['i', 'include', 'require', 'external'];
  var str = standardizeConsoleCommands(raw);
  var parsed;
  parsed = parseCommands(str);
  parsed.forEach(function(cmd) {
    var i = blocked.indexOf(cmd.name);
    if (i > -1) {
      stop("The -" + blocked[i] + " command cannot be run in the browser");
    }
  });
  return parsed;
}
