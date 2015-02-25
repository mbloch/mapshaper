/* @require mapshaper-path-utils */

/*
// file "formats" mapped to file "types" (types can be inferred from filename,
// some formats require parsing to identify)
{
  shapefile: shp,
  geojson: json,
  topojson: json,
  dbf: dbf,
  dsv: txt
}
// TODO: Consider alternative to these "types": determine if file is binary
//   or text from filename, identify binary formats from extension, identify text
//   formats using regex on string.
*/

// Guess the type of a data file from filename or a type name (e.g. 'json')
// Defined types: shp, dbf, json, txt
MapShaper.guessFileType = function(file) {
  var rxp = /[a-z0-9]*$/i,
      suff = rxp.exec(file)[0].toLowerCase(),
      type;
  if (file == '/dev/stdin' || /json$/.test(suff)) {
    type = 'json';
  } else if (suff == 'shp' || suff == 'dbf') {
    type = suff;
  } else {
    type = 'txt'; // assume text file if none of above
  }
  return type;
};

// Infer output format by considering file name and (optional) input format
MapShaper.inferOutputFormat = function(file, inputFormat) {
  var type = MapShaper.guessFileType(file),
      ext = utils.getFileExtension(file).toLowerCase(),
      format = null;
  if (type == 'shp') {
    format = 'shapefile';
  } else if (type == 'dbf') {
    format = 'dbf';
  } else if (type == 'json') {
    format = 'geojson';
    if (ext == 'geojson') {
      format = 'geojson';
    } else if (ext == 'topojson' || inputFormat == 'topojson') {
      format = 'topojson';
    } else {
      format = 'geojson';
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


MapShaper.isBinaryFileType = function(type) {
  return type == 'shp' || type == 'dbf';
};

// Detect extensions of some unsupported file types, for cmd line validation
MapShaper.filenameIsUnsupportedOutputType = function(file) {
  var rxp = /\.(shx|prj|xls|xlsx|gdb|sbn|sbx|xml|kml)$/i;
  return rxp.test(file);
};
