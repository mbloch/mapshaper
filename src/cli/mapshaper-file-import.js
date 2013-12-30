/* @requires
mapshaper-import
mapshaper-table-import
*/

MapShaper.importFromFile = function(fname, opts) {
  var fileType = MapShaper.guessFileType(fname),
      content = MapShaper.readGeometryFile(fname, fileType),
      data = MapShaper.importContent(content, fileType, opts);
  if (fileType == 'shp' && data.layers.length == 1) {
    data.layers[0].data = MapShaper.importDbfTable(fname, opts.encoding);
  }
  data.info.input_files = [fname];
  return data;
};

MapShaper.readGeometryFile = function(fname, fileType) {
  var content;
  if (fileType == 'shp') {
    content = Node.readFile(fname);
  } else if (fileType == 'json') {
    content = Node.readFile(fname, 'utf-8');
  } else {
    error("Unexpected input file:", fname);
  }
  return content;
};
