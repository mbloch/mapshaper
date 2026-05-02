
import utils from '../utils/mapshaper-utils';
import { getFileExtension } from '../utils/mapshaper-filename-utils';
import { PACKAGE_EXT } from '../pack/mapshaper-pack-constants';

// Guess the type of a data file from file extension, or return null if not sure
// File type is different than data type
//
export function guessInputFileType(file) {
  var ext = getFileExtension(file || '').toLowerCase(),
      type = null;
  if (ext == 'dbf' || ext == 'shp' || ext == 'kml' || ext == 'svg' || ext == 'fgb' || ext == 'gpkg') {
    type = ext;
  } else if (ext == 'parquet' || ext == 'geoparquet') {
    type = 'parquet';
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

// Heuristic: detect inline comma-delimited data passed as an -i argument.
// Required signals (intentionally strict to avoid false positives on filenames):
//   1. Contains a real newline OR the literal escape sequence "\n"
//   2. The first and second non-empty lines each contain at least one comma
// Multi-character delimiters (tab, semicolon, pipe) are not detected here;
// only comma-delimited input is supported as inline data for now.
export function stringLooksLikeCsv(str) {
  if (typeof str !== 'string' || str.length === 0) return false;
  if (!stringHasInlineCsvNewline(str)) return false;
  var normalized = unescapeInlineCsv(str);
  var lines = normalized.split(/\r?\n/).filter(function(line) {
    return line.length > 0;
  });
  if (lines.length < 2) return false;
  return lines[0].indexOf(',') > -1 && lines[1].indexOf(',') > -1;
}

// True if @str contains either a real newline or the literal two-character
// escape sequence "\n" (backslash + n) anywhere in the string.
export function stringHasInlineCsvNewline(str) {
  return str.indexOf('\n') > -1 || /\\n/.test(str);
}

// Convert literal "\n" / "\r\n" escape sequences in an inline CSV string
// into real newline characters. If the input already contains a real newline,
// it is returned unchanged so that backslash-n sequences inside quoted cells
// are preserved verbatim.
export function unescapeInlineCsv(str) {
  if (typeof str !== 'string') return str;
  if (str.indexOf('\n') > -1) return str;
  return str.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
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

// Returns true if @file has an extension that may identify a mapshaper
// command file (e.g. "commands.txt"). Detection still requires a content
// sniff via stringLooksLikeCommandFile().
export function isPotentialCommandFile(file) {
  var ext = getFileExtension(file || '').toLowerCase();
  return ext === 'txt';
}

// True if @str looks like the content of a mapshaper command file: the first
// non-blank, non-comment line begins with the magic word "mapshaper".
export function stringLooksLikeCommandFile(str) {
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
    ext == 'fgb' || ext == 'gpkg' || ext == 'parquet' || ext == 'geoparquet' || ext == PACKAGE_EXT; // GUI also supports zip files
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
