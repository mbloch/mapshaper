
import utils from '../utils/mapshaper-utils';
import { getFileExtension } from '../utils/mapshaper-filename-utils';
import { PACKAGE_EXT } from '../pack/mapshaper-pack';

// Guess the type of a data file from file extension, or return null if not sure
export function guessInputFileType(file) {
  var ext = getFileExtension(file || '').toLowerCase(),
      type = null;
  if (ext == 'dbf' || ext == 'shp' || ext == 'prj' || ext == 'shx' || ext == 'kml' || ext == 'cpg') {
    type = ext;
  } else if (/json$/.test(ext)) {
    type = 'json';
  } else if (ext == 'csv' || ext == 'tsv' || ext == 'txt' || ext == 'tab') {
    type = 'text';
  } else if (ext == PACKAGE_EXT) {
    type = PACKAGE_EXT;
  }
  return type;
}

export function guessInputContentType(content) {
  var type = null;
  if (utils.isString(content)) {
    type = stringLooksLikeJSON(content) && 'json' ||
      stringLooksLikeKML(content) && 'kml' || 'text';
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

export function couldBeDsvFile(name) {
  var ext = getFileExtension(name).toLowerCase();
  return /csv|tsv|txt$/.test(ext);
}

// File looks like an importable file type
// name: filename or path
export function looksLikeImportableFile(name) {
  return !!guessInputFileType(name);
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

export function isZipFile(file) {
  return /\.zip$/i.test(file);
}

export function isKmzFile(file) {
  return /\.kmz$/i.test(file);
}

export function isGzipFile(file) {
  return /\.gz$/i.test(file);
}

export function isSupportedOutputFormat(fmt) {
  var types = ['geojson', 'topojson', 'json', 'dsv', 'dbf', 'shapefile', 'svg', 'kml', PACKAGE_EXT];
  return types.indexOf(fmt) > -1;
}

export function getFormatName(fmt) {
  return {
    geojson: 'GeoJSON',
    topojson: 'TopoJSON',
    json: 'JSON records',
    dsv: 'CSV',
    dbf: 'DBF',
    kml: 'KML',
    kmz: 'KMZ',
    [PACKAGE_EXT]: 'Snapshot file',
    shapefile: 'Shapefile',
    svg: 'SVG'
  }[fmt] || '';
}

// Assumes file at @path is one of Mapshaper's supported file types
export function isSupportedBinaryInputType(path) {
  var ext = getFileExtension(path).toLowerCase();
  return ext == 'shp' || ext == 'shx' || ext == 'dbf' || ext == PACKAGE_EXT; // GUI also supports zip files
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
