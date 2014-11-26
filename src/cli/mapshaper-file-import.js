/* @requires
mapshaper-import
mapshaper-table-import
*/

api.importFile = function(path, opts) {
  var fileType = MapShaper.guessFileType(path),
      dataset;
  cli.checkFileExists(path);
  opts = opts || {};
  if (!opts.files && path != "/dev/stdin") {
    opts.files = [path];
  }
  if (fileType == 'shp') {
    dataset = MapShaper.importShapefile(path, opts);
  } else if (fileType == 'json') {
    dataset = MapShaper.importJsonFile(path, opts);
  } else {
    stop("Unexpected input file:", path);
  }
  return dataset;
};

MapShaper.importShapefile = function(path, opts) {
  var dataset = MapShaper.importFileContent(path, 'shp', opts), // pass path to shp reader to read in chunks
      fileName = utils.parseLocalPath(path).filename,
      dbfPath = cli.replaceFileExtension(path, 'dbf'),
      lyr = dataset.layers[0];
  if (cli.isFile(dbfPath)) {
    lyr.data = MapShaper.importDbfTable(dbfPath, opts.encoding);
    if (lyr.shapes.length != lyr.data.size()) {
      stop(utils.format("[%s] Different record counts in .shp and .dbf (%d and %d).",
        fileName, lyr.shapes.length, lyr.data.size()));
    }
  } else {
    message(utils.format("[%s] .dbf file is missing -- shapes imported without attribute data.", fileName));
  }
  return dataset;
};

MapShaper.importJsonFile = function(path, opts) {
  var content = require('rw').readFileSync(path, 'utf-8');
  return MapShaper.importFileContent(content, 'json', opts);
};
