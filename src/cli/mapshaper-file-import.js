/* @requires
mapshaper-import
mapshaper-table-import
*/

api.importFile = function(path, opts) {
  var fileType = MapShaper.guessFileType(path),
      content, dataset;

  cli.checkFileExists(path);

  opts = opts || {};
  if (!opts.files) {
    opts.files = [path];
  }

  if (fileType == 'shp') {
    content = path;
  } else {
    content = MapShaper.readGeometryFile(path, fileType);
  }

  dataset = MapShaper.importFileContent(content, fileType, opts);
  if (fileType == 'shp' && dataset.layers.length == 1) {
    var lyr0 = dataset.layers[0],
        data = MapShaper.importDbfTable(path, opts.encoding);
    if (data) {
      if (lyr0.shapes.length != data.size()) {
        stop(Utils.format("[%s] Different record counts in .shp and .dbf (%d and %d)",
          path, lyr0.shapes.length, data.size()));
      }
      lyr0.data = data;
    }
  }
  return dataset;
};

MapShaper.readGeometryFile = function(path, fileType) {
  var content;
  if (fileType == 'shp') {
    content = Node.readFile(path);
  } else if (fileType == 'json') {
    content = Node.readFile(path, 'utf-8');
  } else {
    error("Unexpected input file:", path);
  }
  return content;
};
