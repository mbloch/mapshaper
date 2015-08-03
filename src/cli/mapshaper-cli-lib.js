/* @requires
mapshaper-cli-utils
mapshaper-common
mapshaper-file-types
mapshaper-commands
mapshaper-encodings
*/

// Handle an error caused by invalid input or misuse of API
function stop() {
  throw new APIError(MapShaper.formatLogArgs(arguments));
}

cli.isFile = function(path) {
  var ss = cli.statSync(path);
  return ss && ss.isFile() || false;
};

cli.fileSize = function(path) {
  var ss = cli.statSync(path);
  return ss && ss.size || 0;
};

cli.isDirectory = function(path) {
  var ss = cli.statSync(path);
  return ss && ss.isDirectory() || false;
};

// @encoding (optional) e.g. 'utf8'
cli.readFile = function(fname, encoding) {
  var rw = require('rw'),
      content = rw.readFileSync(fname);
  if (encoding) {
    content = MapShaper.decodeString(content, encoding);
  }
  return content;
};

// @content Buffer, ArrayBuffer or string
cli.writeFile = function(path, content) {
  if (content instanceof ArrayBuffer) {
    content = cli.convertArrayBuffer(content);
  }
  require('rw').writeFileSync(path, content);
};

// Returns Node Buffer
cli.convertArrayBuffer = function(buf) {
  var src = new Uint8Array(buf),
      dest = new Buffer(src.length);
  for (var i = 0, n=src.length; i < n; i++) {
    dest[i] = src[i];
  }
  return dest;
};

// Expand any "*" wild cards in file name
// (For the Windows command line; unix shells do this automatically)
cli.expandFileName = function(name) {
  if (name.indexOf('*') == -1) return [name];
  var path = utils.parseLocalPath(name),
      dir = path.directory || '.',
      listing = require('fs').readdirSync(dir),
      rxp = utils.wildcardToRegExp(path.filename);
  return listing.reduce(function(memo, item) {
    var path = require('path').join(dir, item);
    if (rxp.test(item) && cli.isFile(path)) {
      memo.push(path);
    }
    return memo;
  }, []);
};

// Expand any wildcards and check that files exist.
cli.validateInputFiles = function(files) {
  files = files.reduce(function(memo, name) {
    return memo.concat(cli.expandFileName(name));
  }, []);
  files.forEach(cli.checkFileExists);
  return files;
};

cli.validateOutputDir = function(name) {
  if (!cli.isDirectory(name)) {
    error("Output directory not found:", name);
  }
};

// TODO: rename and improve
// Want to test if a path is something readable (e.g. file or stdin)
cli.checkFileExists = function(path) {
  if (!cli.isFile(path) && path != '/dev/stdin') {
    stop("File not found (" + path + ")");
  }
};

cli.statSync = function(fpath) {
  var obj = null;
  try {
    obj = require('fs').statSync(fpath);
  } catch(e) {}
  return obj;
};

// Expose internal objects for testing
utils.extend(api.internal, {
  BinArray: BinArray,
  DouglasPeucker: DouglasPeucker,
  Visvalingam: Visvalingam,
  ShpReader: ShpReader,
  ShpType: ShpType,
  Bounds: Bounds
});

api.T = T;

if (typeof define === "function" && define.amd) {
  define("mapshaper", api);
} else if (typeof module === "object" && module.exports) {
  module.exports = api;
}
this.mapshaper = api;
