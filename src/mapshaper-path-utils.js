/* @require mapshaper-common */

utils.replaceFileExtension = function(path, ext) {
  var info = utils.parseLocalPath(path);
  return info.pathbase + '.' + ext;
};

utils.getPathSep = function(path) {
  // TODO: improve
  return path.indexOf('/') == -1 && path.indexOf('\\') != -1 ? '\\' : '/';
};

// Parse the path to a file without using Node
// Assumes: not a directory path
utils.parseLocalPath = function(path) {
  var obj = {},
      sep = utils.getPathSep(path),
      parts = path.split(sep),
      i;

  if (parts.length == 1) {
    obj.filename = parts[0];
    obj.directory = "";
  } else {
    obj.filename = parts.pop();
    obj.directory = parts.join(sep);
  }
  i = obj.filename.lastIndexOf('.');
  if (i > -1) {
    obj.extension = obj.filename.substr(i + 1);
    obj.basename = obj.filename.substr(0, i);
    obj.pathbase = path.substr(0, path.lastIndexOf('.'));
  } else {
    obj.extension = "";
    obj.basename = obj.filename;
    obj.pathbase = path;
  }
  return obj;
};

utils.getFileBase = function(path) {
  return utils.parseLocalPath(path).basename;
};

utils.getFileExtension = function(path) {
  return utils.parseLocalPath(path).extension;
};

utils.getPathBase = function(path) {
  return utils.parseLocalPath(path).pathbase;
};

MapShaper.getCommonFileBase = function(names) {
  return names.reduce(function(memo, name, i) {
    if (i === 0) {
      memo = utils.getFileBase(name);
    } else {
      memo = MapShaper.mergeNames(memo, name);
    }
    return memo;
  }, "");
};


