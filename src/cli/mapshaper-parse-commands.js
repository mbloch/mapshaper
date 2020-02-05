/* @requires mapshaper-options, mapshaper-option-parsing-utils */

// Parse an array or a string of command line tokens into an array of
// command objects.
internal.parseCommands = function(tokens) {
  if (Array.isArray(tokens) && utils.isObject(tokens[0])) {
    // argv seems to contain parsed commands already... make a copy
    return tokens.map(function(cmd) {
      return {name: cmd.name, options: utils.extend({}, cmd.options)};
    });
  }
  if (utils.isString(tokens)) {
    tokens = internal.splitShellTokens(tokens);
  }
  return internal.getOptionParser().parseArgv(tokens);
};

internal.standardizeConsoleCommands = function(raw) {
  var str = raw.replace(/^mapshaper\b/, '').trim();
  if (/^[a-z]/.test(str)) {
    // add hyphen prefix to bare command
    str = '-' + str;
  }
  return str;
};

// Parse a command line string for the browser console
internal.parseConsoleCommands = function(raw) {
  var blocked = ['i', 'include', 'require', 'external'];
  var str = internal.standardizeConsoleCommands(raw);
  var parsed;
  parsed = internal.parseCommands(str);
  parsed.forEach(function(cmd) {
    var i = blocked.indexOf(cmd.name);
    if (i > -1) {
      stop("The -" + blocked[i] + " command cannot be run in the browser");
    }
  });
  return parsed;
};
