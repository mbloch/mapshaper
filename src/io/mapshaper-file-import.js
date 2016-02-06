/* @requires
mapshaper-import
mapshaper-dbf-table
*/

api.importFiles = function(opts) {
  var files = opts.files ? cli.validateInputFiles(opts.files) : [],
      dataset;
  if ((opts.merge_files || opts.combine_files) && files.length > 1) {
    dataset = api.mergeFiles(files, opts);
  } else if (files.length == 1) {
    dataset = api.importFile(files[0], opts);
  } else if (opts.stdin) {
    dataset = api.importFile('/dev/stdin', opts);
  } else {
    stop('Missing input file(s)');
  }
  return dataset;
};

api.importFile = function(path, opts) {
  cli.checkFileExists(path);
  var isBinary = MapShaper.isBinaryFile(path),
      isShp = MapShaper.guessInputFileType(path) == 'shp',
      input = {},
      type, content;

  if (isShp) {
    content = null; // let ShpReader read the file (supports larger files)
  } else if (isBinary) {
    content = cli.readFile(path);
  } else {
    content = cli.readFile(path, opts && opts.encoding || 'utf-8');
  }

  type = MapShaper.guessInputType(path, content) || error("Unkown file type:", path);
  input[type] = {filename: path, content: content};
  if (type == 'shp' || type == 'dbf') {
    MapShaper.readShapefileAuxFiles(path, input);
  }
  if (type == 'shp' && !input.dbf) {
    message(utils.format("[%s] .dbf file is missing -- shapes imported without attribute data.", path));
  }
  return MapShaper.importContent(input, opts);
};

api.importDataTable = function(path, opts) {
  // TODO: avoid the overhead of importing shape data, if present
  var dataset = api.importFile(path, opts);
  return dataset.layers[0].data;
};

MapShaper.readShapefileAuxFiles = function(path, obj) {
  var dbfPath = utils.replaceFileExtension(path, 'dbf');
  var cpgPath = utils.replaceFileExtension(path, 'cpg');
  var prjPath = utils.replaceFileExtension(path, 'prj');
  if (cli.isFile(prjPath)) {
    obj.prj = {filename: prjPath, content: cli.readFile(prjPath, 'utf-8')};
  }
  if (!obj.dbf && cli.isFile(dbfPath)) {
    obj.dbf = {filename: dbfPath, content: cli.readFile(dbfPath)};
  }
  if (obj.dbf && cli.isFile(cpgPath)) {
    obj.cpg = {filename: cpgPath, content: cli.readFile(cpgPath, 'utf-8').trim()};
  }
};
