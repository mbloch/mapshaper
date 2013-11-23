/* @requires
mapshaper-data-table
mapshaper-import
*/


MapShaper.importFromFile = function(fname, opts) {
  var fileType = MapShaper.guessFileType(fname),
      content,
      table;
  if (fileType == 'shp') {
    content = Node.readFile(fname);
    table = MapShaper.importDbfTable(fname);
  } else if (fileType == 'json') {
    content = Node.readFile(fname, 'utf-8');
  } else {
    error("Unexpected input file:", fname);
  }
  var data = MapShaper.importContent(content, fileType, opts);
  // TODO: refactor kludge
  if (table && data.layers.length == 1) {
    data.layers[0].data = table;
  }
  return data;
};


MapShaper.importDbfTable = function(shpName) {
  var dbfName = cli.replaceFileExtension(shpName, 'dbf');
  if (!Node.fileExists(dbfName)) return null;
  return new ShapefileTable(Node.readFile(dbfName));
};
