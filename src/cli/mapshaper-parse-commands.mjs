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

// Parse the text content of a mapshaper script file (e.g. "commands.txt")
// into a single normalized command string suitable for parseCommands().
//
// Script syntax (a superset of the equivalent shell command line):
//   - Optional leading "mapshaper" magic word (used by the file-type sniffer).
//   - "#" begins a comment that runs to the end of the line. Comments are
//     ignored unless the "#" appears inside a quoted string.
//   - Newlines are command separators (unless they fall inside a quoted
//     string). A trailing backslash on a line is stripped, so shell-style
//     "\" line continuations are accepted but not required.
//   - Commands must begin with "-" (e.g. "-i", "-target"). Lines that do
//     not start with "-" are treated as continuations of the previous
//     command.
//   - As on the CLI, an initial "-i" is implied: if the first non-blank
//     content (after the optional "mapshaper" word) does not start with
//     "-", "-i " is prepended to it.
//
export function parseScriptContent(content) {
  if (typeof content != 'string') {
    content = String(content || '');
  }
  // Strip BOM if present
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);

  var lines = []; // logical lines, with embedded newlines if inside quotes
  var current = '';
  var quote = null; // null, "'", or '"'
  var inComment = false;

  for (var i = 0; i < content.length; i++) {
    var c = content.charAt(i);
    if (inComment) {
      if (c === '\n') {
        inComment = false;
        lines.push(current);
        current = '';
      }
      // else: skip char inside the comment
      continue;
    }
    if (quote) {
      current += c;
      if (c === quote) {
        // count preceding backslashes; an odd count means the quote is escaped
        var bs = 0;
        for (var j = i - 1; j >= 0 && content.charAt(j) === '\\'; j--) bs++;
        if (bs % 2 === 0) quote = null;
      }
      continue;
    }
    if (c === '#') {
      inComment = true;
    } else if (c === "'" || c === '"') {
      quote = c;
      current += c;
    } else if (c === '\n') {
      lines.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  if (current.length > 0) lines.push(current);
  if (quote) {
    stop('Unterminated quoted string in script');
  }

  var commands = [];
  var cur = '';
  var sawMagicWord = false;
  for (var k = 0; k < lines.length; k++) {
    var line = lines[k];
    // Strip trailing backslash continuation (and any whitespace before/after it)
    line = line.replace(/\s*\\\s*$/, '').trim();
    if (!line) continue;

    if (!sawMagicWord && commands.length === 0 && cur === '' &&
        /^mapshaper(\s|$)/.test(line)) {
      sawMagicWord = true;
      line = line.replace(/^mapshaper\s*/, '');
      if (!line) continue;
    }

    if (line.charAt(0) === '-') {
      if (cur) commands.push(cur);
      cur = line;
    } else if (!cur && commands.length === 0) {
      // Implicit -i for the first command, mirroring CLI behavior:
      //   "mapshaper foo.shp" => "mapshaper -i foo.shp"
      cur = '-i ' + line;
    } else {
      cur += ' ' + line;
    }
  }
  if (cur) commands.push(cur);
  return commands.join(' ');
}
