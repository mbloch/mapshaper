/* @requires
mapshaper-common
mapshaper-file-types
*/

var cli = {};

cli.isFile = function(path) {
  var ss;
  if (cli.fileIsLoaded(path)) return true;
  ss = cli.statSync(path);
  return ss ? ss.isFile() : false;
};

cli.fileIsLoaded = function(path) {
  return (cli.input && (path in cli.input));
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
  var content;
  if (cli.fileIsLoaded(fname)) {
    content = cli.input[fname];
    delete cli.input[fname];
  } else {
    content = require(fname == '/dev/stdin' ? 'rw' : 'fs').readFileSync(fname);
  }
  if (encoding && Buffer.isBuffer(content)) {
    content = MapShaper.decodeString(content, encoding);
  }
  return content;
};

// @content Buffer, ArrayBuffer or string
cli.writeFile = function(path, content, cb) {
  var fs = require('rw');
  if (content instanceof ArrayBuffer) {
    content = cli.convertArrayBuffer(content); // convert to Buffer
  }
  if (cli.output) {
    cli.output[path] = content;
    if (cb) cb();
  } else if (cb) {
    fs.writeFile(path, content, cb);
  } else {
    fs.writeFileSync(path, content);
  }
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
