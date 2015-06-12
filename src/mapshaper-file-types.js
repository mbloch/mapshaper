/* @require mapshaper-path-utils */

// Guess the type of a data file from file extension, or return null if not sure
MapShaper.guessInputFileType = function(file, content) {
  var ext = utils.getFileExtension(file || '').toLowerCase(),
      isText = utils.isString(content),
      type = null;
  if (ext == 'dbf' || ext == 'shp' || ext == 'prj') {
    type = ext;
  } else if (/json$/.test(ext) || utils.isObject(content) ||
       isText && MapShaper.stringIsJsonObject(content)) {
    type = 'json';
  } else if (isText) {
    type = 'text';
  }
  return type;
};

MapShaper.stringIsJsonObject = function(str) {
  return /^\s*\{/.test(String(str));
};

// Infer output format by considering file name and (optional) input format
MapShaper.inferOutputFormat = function(file, inputFormat) {
  var ext = utils.getFileExtension(file).toLowerCase(),
      format = null;
  if (ext == 'shp') {
    format = 'shapefile';
  } else if (ext == 'dbf') {
    format = 'dbf';
  } else if (/json$/.test(ext)) {
    format = 'geojson';
    if (ext == 'topojson' || inputFormat == 'topojson' && ext != 'geojson') {
      format = 'topojson';
    }
  } else if (/csv|tsv|txt$/.test(ext)) {
    format = 'dsv';
  } else if (inputFormat) {
    format = inputFormat;
  }
  return format;
};

MapShaper.isSupportedOutputFormat = function(fmt) {
  var types = ['geojson', 'topojson', 'dsv', 'dbf', 'shapefile'];
  return types.indexOf(fmt) > -1;
};

// Assumes file at @path is one of Mapshaper's supported file types
MapShaper.isBinaryFile = function(path) {
  var ext = utils.getFileExtension(path).toLowerCase();
  return ext == 'shp' || ext == 'dbf' || ext == 'zip'; // GUI accepts zip files
};

// Detect extensions of some unsupported file types, for cmd line validation
MapShaper.filenameIsUnsupportedOutputType = function(file) {
  var rxp = /\.(shx|prj|xls|xlsx|gdb|sbn|sbx|xml|kml)$/i;
  return rxp.test(file);
};
