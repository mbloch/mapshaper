/* @requires
mapshaper-import
mapshaper-dbf-table
*/

api.importFiles = function(opts) {
  var files = opts.files,
      dataset;
  if ((opts.merge_files || opts.combine_files) && files.length > 1) {
    dataset = api.mergeFiles(files, opts);
  } else if (files && files.length == 1) {
    dataset = api.importFile(files[0], opts);
  } else if (opts.stdin) {
    dataset = api.importFile('/dev/stdin', opts);
  } else {
    stop('[i] Missing input file(s)');
  }
  return dataset;
};

api.importFile = function(path, opts) {
  cli.checkFileExists(path);
  var isBinary = MapShaper.isBinaryFile(path),
      textEncoding = isBinary ? null : opts && opts.encoding || 'utf-8',
      content = cli.readFile(path, textEncoding),
      type = MapShaper.guessInputFileType(path, content),
      obj = {};
  obj[type] = {filename: path, content: content};
  if (type == 'shp' || type == 'dbf') {
    MapShaper.readShapefileAuxFiles(path, obj);
  }
  if (type == 'shp' && !obj.dbf) {
    message(utils.format("[%s] .dbf file is missing -- shapes imported without attribute data.", path));
  }
  return MapShaper.importContent(obj, opts);
};

MapShaper.readShapefileAuxFiles = function(path, obj) {
  var dbfPath = utils.replaceFileExtension(path, 'dbf');
  var cpgPath = utils.replaceFileExtension(path, 'cpg');
  if (!obj.dbf && cli.isFile(dbfPath)) {
    obj.dbf = {filename: dbfPath, content: cli.readFile(dbfPath)};
  }
  if (obj.dbf && cli.isFile(cpgPath)) {
    obj.cpg = {filename: cpgPath, content: cli.readFile(cpgPath, 'utf-8').trim()};
  }
};
