/* @requires mapshaper-options */

// Parse an array or a string of command line tokens into an array of
// command objects.
MapShaper.parseCommands = function(tokens) {
  if (utils.isString(tokens)) {
    tokens = MapShaper.splitShellTokens(tokens);
  }
  return MapShaper.getOptionParser().parseArgv(tokens);
};

// Parse a command line string for the browser console
MapShaper.parseConsoleCommands = function(raw) {
  var str = raw.replace(/^mapshaper\b/, '').trim();
  var parsed;
  if (/^[a-z]/.test(str)) {
    // add hyphen prefix to bare command
    str = '-' + str;
  }
  if (utils.contains(MapShaper.splitShellTokens(str), '-i')) {
    stop("The input command cannot be run in the browser");
  }
  parsed = MapShaper.parseCommands(str);
  // block implicit initial -i command
  if (parsed.length > 0 && parsed[0].name == 'i') {
    stop(utils.format("Unable to run [%s]", raw));
  }
  return parsed;
};
