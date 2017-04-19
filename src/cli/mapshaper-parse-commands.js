/* @requires mapshaper-options, mapshaper-chunker */

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

// Parse a command line string for the browser console
internal.parseConsoleCommands = function(raw) {
  var str = raw.replace(/^mapshaper\b/, '').trim();
  var parsed;
  if (/^[a-z]/.test(str)) {
    // add hyphen prefix to bare command
    str = '-' + str;
  }
  if (utils.contains(internal.splitShellTokens(str), '-i')) {
    stop("The input command cannot be run in the browser");
  }
  parsed = internal.parseCommands(str);
  // block implicit initial -i command
  if (parsed.length > 0 && parsed[0].name == 'i') {
    stop(utils.format("Unable to run [%s]", raw));
  }
  return parsed;
};
