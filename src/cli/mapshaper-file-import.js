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
    dataset.layers[0].data = MapShaper.importDbfTable(path, opts.encoding);
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
