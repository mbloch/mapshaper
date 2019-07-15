/* @require mapshaper-filename-utils */

// Guess the type of a data file from file extension, or return null if not sure
internal.guessInputFileType = function(file) {
  var ext = utils.getFileExtension(file || '').toLowerCase(),
      type = null;
  if (ext == 'dbf' || ext == 'shp' || ext == 'prj' || ext == 'shx') {
    type = ext;
  } else if (/json$/.test(ext)) {
    type = 'json';
  } else if (ext == 'csv' || ext == 'tsv' || ext == 'txt' || ext == 'tab') {
    type = 'text';
  }
  return type;
};

internal.guessInputContentType = function(content) {
  var type = null;
  if (utils.isString(content)) {
    type = internal.stringLooksLikeJSON(content) ? 'json' : 'text';
  } else if (utils.isObject(content) && content.type || utils.isArray(content)) {
    type = 'json';
  }
  return type;
};

internal.guessInputType = function(file, content) {
  return internal.guessInputFileType(file) || internal.guessInputContentType(content);
};

//
internal.stringLooksLikeJSON = function(str) {
  return /^\s*[{[]/.test(String(str));
};

internal.couldBeDsvFile = function(name) {
  var ext = utils.getFileExtension(name).toLowerCase();
  return /csv|tsv|txt$/.test(ext);
};

internal.isZipFile = function(file) {
  return /\.zip$/i.test(file);
};

internal.isSupportedOutputFormat = function(fmt) {
  var types = ['geojson', 'topojson', 'json', 'dsv', 'dbf', 'shapefile', 'svg'];
  return types.indexOf(fmt) > -1;
};

internal.getFormatName = function(fmt) {
  return {
    geojson: 'GeoJSON',
    topojson: 'TopoJSON',
    json: 'JSON records',
    dsv: 'CSV',
    dbf: 'DBF',
    shapefile: 'Shapefile',
    svg: 'SVG'
  }[fmt] || '';
};

// Assumes file at @path is one of Mapshaper's supported file types
internal.isSupportedBinaryInputType = function(path) {
  var ext = utils.getFileExtension(path).toLowerCase();
  return ext == 'shp' || ext == 'shx' || ext == 'dbf'; // GUI also supports zip files
};

// Detect extensions of some unsupported file types, for cmd line validation
internal.filenameIsUnsupportedOutputType = function(file) {
  var rxp = /\.(shx|prj|xls|xlsx|gdb|sbn|sbx|xml|kml)$/i;
  return rxp.test(file);
};
