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
  var blocked = 'o,i,join,clip,erase'.split(','),
      tokens, parsed, str;
  str = raw.replace(/^mapshaper\b/, '').trim();
  if (/^[^\-]/.test(str)) {
    // add hyphen prefix to bare command
    str = '-' + str;
  }
  tokens = MapShaper.splitShellTokens(str);
  tokens.forEach(function(tok) {
    if (tok[0] == '-' && utils.contains(blocked, tok.substr(1))) {
      stop("These commands can not be run in the browser:", blocked.join(', '));
    }
  });
  parsed = MapShaper.parseCommands(str);
  // block implicit initial -i command
  if (parsed.length > 0 && parsed[0].name == 'i') {
    stop(utils.format("Unable to run [%s]", raw));
  }
  return parsed;
};
