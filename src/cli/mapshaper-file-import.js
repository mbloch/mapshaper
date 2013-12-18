/* @requires
mapshaper-data-table
mapshaper-import
*/

MapShaper.importFromFile = function(fname, opts) {
  var fileType = MapShaper.guessFileType(fname),
      content = MapShaper.readGeometryFile(fname, fileType),
      data = MapShaper.importContent(content, fileType, opts);
  if (fileType == 'shp' && data.layers.length == 1) {
    data.layers[0].data = MapShaper.importDbfTable(fname);
  }
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

MapShaper.importDbfTable = function(shpName) {
  var dbfName = cli.replaceFileExtension(shpName, 'dbf');
  if (!Node.fileExists(dbfName)) return null;
  return new ShapefileTable(Node.readFile(dbfName));
};
