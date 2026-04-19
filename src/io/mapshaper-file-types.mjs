
import utils from '../utils/mapshaper-utils';
import { getFileExtension } from '../utils/mapshaper-filename-utils';
import { PACKAGE_EXT } from '../pack/mapshaper-pack';

// Guess the type of a data file from file extension, or return null if not sure
// File type is different than data type
//
export function guessInputFileType(file) {
  var ext = getFileExtension(file || '').toLowerCase(),
      type = null;
  if (ext == 'dbf' || ext == 'shp' || ext == 'kml' || ext == 'svg' || ext == 'fgb' || ext == 'gpkg') {
    type = ext;
  } else if (isAuxiliaryInputFileType(ext)) {
    type = ext;
  } else if (/json$/.test(ext)) { // matches topojson, geojson, json
    type = 'json';
  } else if (ext == 'csv' || ext == 'tsv' || ext == 'txt' || ext == 'tab') {
    type = 'text';
  } else if (ext == PACKAGE_EXT) {
    type = PACKAGE_EXT;
  }
  return type;
}

// File types that can be imported but are not convertible to datasets
export function isAuxiliaryInputFileType(type) {
  return type == 'prj' || type == 'shx' || type == 'cpg';
}

export function guessInputContentType(content) {
  var type = null;
  if (utils.isString(content)) {
    type = stringLooksLikeJSON(content) && 'json' ||
      stringLooksLikeKML(content) && 'kml' ||
      stringLooksLikeSVG(content) && 'svg' || 'text';
  } else if (utils.isObject(content) && content.type || utils.isArray(content)) {
    type = 'json';
  }
  return type;
}

export function guessInputType(file, content) {
  return guessInputFileType(file) || guessInputContentType(content);
}

export function stringLooksLikeJSON(str) {
  return /^\s*[{[]/.test(String(str));
}

export function stringLooksLikeKML(str) {
  str = String(str);
  return str.includes('<kml ') && str.includes('xmlns="http://www.opengis.net/kml/');
}

export function stringLooksLikeSVG(str) {
  str = String(str);
  return str.includes('<svg ') && str.includes('xmlns="http://www.w3.org/2000/svg"');
}

export function couldBeDsvFile(name) {
  var ext = getFileExtension(name).toLowerCase();
  return /csv|tsv|txt$/.test(ext);
}

// File looks like an importable file type
// name: filename or path
export function looksLikeImportableFile(name) {
  return !!guessInputFileType(name) || isImportableAsBinary(name);
}

// File looks like a directly readable data file type
// name: filename or path
export function looksLikeContentFile(name) {
  var type = guessInputFileType(name);
  return !!type && type != 'gz' && type != 'zip';
}

export function isPackageFile(file) {
  return file.endsWith('.' + PACKAGE_EXT);
}

// Returns true if @file has an extension that may identify a mapshaper script
// file (e.g. "commands.txt"). Detection still requires a content sniff via
// stringLooksLikeScript().
export function isPotentialScriptFile(file) {
  var ext = getFileExtension(file || '').toLowerCase();
  return ext === 'txt';
}

// True if @str looks like the content of a mapshaper script file: the first
// non-blank, non-comment line begins with the magic word "mapshaper".
export function stringLooksLikeScript(str) {
  str = String(str || '');
  // Skip a leading BOM
  if (str.charCodeAt(0) === 0xFEFF) str = str.slice(1);
  var lines = str.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.charAt(0) === '#') continue;
    return /^mapshaper(\s|$)/.test(line);
  }
  return false;
}

export function isZipFile(file) {
  return /\.zip$/i.test(file);
}

export function isKmzFile(file) {
  return /\.kmz$/i.test(file);
}

export function isGzipFile(file) {
  return /\.gz$/i.test(file);
}

// Assumes file at @path is one of Mapshaper's supported file types
export function isSupportedBinaryInputType(path) {
  var ext = getFileExtension(path).toLowerCase();
  return ext == 'shp' || ext == 'shx' || ext == 'dbf' ||
    ext == 'fgb' || ext == 'gpkg' || ext == PACKAGE_EXT; // GUI also supports zip files
}

export function isImportableAsBinary(path) {
  var type = guessInputFileType(path);
  return isSupportedBinaryInputType(path) || isZipFile(path) ||
    isGzipFile(path) || isKmzFile(path) || isPackageFile(path) ||
    type == 'json' || type == 'text';
}

// Detect extensions of some unsupported file types, for cmd line validation
export function filenameIsUnsupportedOutputType(file) {
  var rxp = /\.(shx|prj|xls|xlsx|gdb|sbn|sbx|xml)$/i;
  return rxp.test(file);
}
