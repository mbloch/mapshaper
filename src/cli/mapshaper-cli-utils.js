/* @requires
mapshaper-common
mapshaper-file-types
*/

var cli = {};

cli.isFile = function(path, cache) {
  var ss = cli.statSync(path);
  return cache && (path in cache) || ss && ss.isFile() || false;
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
cli.readFile = function(fname, encoding, cache) {
  var content;
  if (cache && (fname in cache)) {
    content = cache[fname];
    delete cache[fname];
  } else if (fname == '/dev/stdin') {
    content = require('rw').readFileSync(fname);
  } else {
    internal.getStateVar('input_files').push(fname);
    content = require('fs').readFileSync(fname);
  }
  if (encoding && Buffer.isBuffer(content)) {
    content = internal.trimBOM(internal.decodeString(content, encoding));
  }
  return content;
};

// @content Buffer or string
cli.writeFile = function(path, content, cb) {
  var fs = require('rw');
  if (cb) {
    fs.writeFile(path, content, preserveContext(cb));
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
  var info = utils.parseLocalPath(name),
      rxp = utils.wildcardToRegExp(info.filename),
      dir = info.directory || '.',
      files = [];

  try {
    require('fs').readdirSync(dir).forEach(function(item) {
      var path = require('path').join(dir, item);
      if (rxp.test(item) && cli.isFile(path)) {
        files.push(path);
      }
    });
  } catch(e) {}

  if (files.length === 0) {
    stop('No files matched (' + name + ')');
  }
  return files;
};

// Expand any wildcards.
cli.expandInputFiles = function(files) {
  return files.reduce(function(memo, name) {
    if (name.indexOf('*') > -1) {
      memo = memo.concat(cli.expandFileName(name));
    } else {
      memo.push(name);
    }
    return memo;
  }, []);
};

cli.validateOutputDir = function(name) {
  if (!cli.isDirectory(name)) {
    error("Output directory not found:", name);
  }
};

// TODO: rename and improve
// Want to test if a path is something readable (e.g. file or stdin)
cli.checkFileExists = function(path, cache) {
  if (!cli.isFile(path, cache) && path != '/dev/stdin') {
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
