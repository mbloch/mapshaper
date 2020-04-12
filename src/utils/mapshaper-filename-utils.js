
import utils from '../utils/mapshaper-utils';

export function replaceFileExtension(path, ext) {
  var info = parseLocalPath(path);
  return info.pathbase + '.' + ext;
}

function getPathSep(path) {
  // TODO: improve
  return path.indexOf('/') == -1 && path.indexOf('\\') != -1 ? '\\' : '/';
}

// Parse the path to a file without using Node
// Assumes: not a directory path
export function parseLocalPath(path) {
  var obj = {},
      sep = getPathSep(path),
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
}

export function getFileBase(path) {
  return parseLocalPath(path).basename;
}

export function getFileExtension(path) {
  return parseLocalPath(path).extension;
}

export function getPathBase(path) {
  return parseLocalPath(path).pathbase;
}

export function getCommonFileBase(names) {
  return names.reduce(function(memo, name, i) {
    if (i === 0) {
      memo = getFileBase(name);
    } else {
      memo = utils.mergeNames(memo, name);
    }
    return memo;
  }, "");
}

export function getOutputFileBase(dataset) {
  var inputFiles = dataset.info && dataset.info.input_files;
  return inputFiles && getCommonFileBase(inputFiles) || 'output';
}
