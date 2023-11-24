import { getOptionParser } from '../cli/mapshaper-options';
import { splitShellTokens } from '../cli/mapshaper-option-parsing-utils';
import { stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import cli from './mapshaper-cli-utils';

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
  var parser = getOptionParser();
  // support multiline string of commands pasted into console
  str = str.split(/\n+/g).map(function(str) {
    var match = /^[a-z][\w-]*/i.exec(str = str.trim());
    //if (match && parser.isCommandName(match[0])) {
    if (match) {
      // add hyphen prefix to bare command
      // also add hyphen to non-command strings, for a better error message
      // ("unsupported command" instead of "The -i command cannot be run in the browser")
      str = '-' + str;
    }
    return str;
  }).join(' ');
  return str;
}

// Parse a command line string for the browser console
export function parseConsoleCommands(raw) {
  var str = standardizeConsoleCommands(raw);
  var parsed = parseCommands(str);
  parsed.forEach(function(cmd) {
    if (['i', 'include', 'require', 'external'].includes(cmd.name)) {
      stop('The ' + cmd.name + ' command cannot be run in the web console.');
    }
  });
  return parsed;
}
