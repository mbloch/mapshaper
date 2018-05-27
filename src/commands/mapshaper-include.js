/* @requires mapshaper-cli-utils, mapshaper-expressions */

internal.include = function(opts) {
  var content, obj, context;
  // TODO: handle web context
  if (!opts.file) {
    stop("Missing name of a JS file to load");
  }
  // opts.input is an optional file cache (used by applyCommands())
  cli.checkFileExists(opts.file, opts.input);
  content = cli.readFile(opts.file, 'utf8', opts.input);
  if (typeof content == 'string') {
    if (!/^\s*\{[\s\S]*\}\s*$/.test(content)) {
      stop("Expected a JavasScript object containing key:value pairs");
    }
    try {
      // Try to isolate the imported JS code from the program scope and global environment
      // TODO: consider whether this is desirable... it may be pointless anyway
      //   as long as we're passing through the 'require()' function
      context = internal.getBaseContext();
      context.require = require;
      obj = Function('ctx', 'with(ctx) {return (' + content + ');}').call({}, context);
      // obj = eval('(' + content + ')');
    } catch(e) {
      stop(e.name, 'in JS source:', e.message);
    }
  } else if (typeof content == 'object') {
    // content could be an object if an object is passed to applyCommands()
    obj = content;
  }

  utils.extend(internal.getStateVar('defs'), obj);
};
