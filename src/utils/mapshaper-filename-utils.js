
import utils from '../utils/mapshaper-utils';

function getPathSep(path) {
  // TODO: improve
  return path.indexOf('/') == -1 && path.indexOf('\\') != -1 ? '\\' : '/';
}

// Parse the path to a file without using Node
// Guess if the path is a directory or file
export function parseLocalPath(path) {
  var obj = {
        filename: '',
        directory: '',
        basename: '',
        extension: ''
      },
      sep = getPathSep(path),
      parts = path.split(sep),
      lastPart = parts.pop(),
      // try to match typical extensions but reject directory names with dots
      extRxp = /\.([a-z][a-z0-9]*)$/i;

  if (extRxp.test(lastPart)) {
    obj.filename = lastPart;
    obj.extension = extRxp.exec(lastPart)[1];
    obj.basename = lastPart.slice(0, lastPart.length - obj.extension.length - 1);
    obj.directory = parts.join(sep);
  } else if (!lastPart) { // path ends with separator
    obj.directory = parts.join(sep);
  } else {
    obj.directory = path;
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
  var info =  parseLocalPath(path);
  if (!info.extension) return path;
  return path.slice(0, path.length - info.extension.length - 1);
}

export function replaceFileExtension(path, ext) {
  return getPathBase(path) + '.' + ext;
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
