/* @requires
mapshaper-import
dbf-import
*/

api.importFiles = function(opts) {
  var files = opts.files ? cli.validateInputFiles(opts.files, opts.input) : [],
      dataset;

  if (opts.stdin) {
    dataset = api.importFile('/dev/stdin', opts);
  } else if (files.length > 0 === false) {
    stop('Missing input file(s)');
  } else if (files.length == 1) {
    dataset = api.importFile(files[0], opts);
  } else if (opts.merge_files) {
    dataset = MapShaper.importMergedFiles(files, opts);
  } else if (opts.combine_files) {
    dataset = MapShaper.importFiles(files, opts);
  } else {
    stop('Invalid inputs');
  }
  return dataset;
};

api.importFile = function(path, opts) {
  var isBinary = MapShaper.isBinaryFile(path),
      isShp = MapShaper.guessInputFileType(path) == 'shp',
      input = {},
      cache = opts && opts.input || null,
      cached = cache && (path in cache),
      type, content;

  cli.checkFileExists(path, cache);
  if (isShp && !cached) {
    content = null; // let ShpReader read the file (supports larger files)
  } else if (isBinary) {
    content = cli.readFile(path, null, cache);
  } else {
    content = cli.readFile(path, opts && opts.encoding || 'utf-8', cache);
  }
  type = MapShaper.guessInputFileType(path) || MapShaper.guessInputContentType(content);
  if (!type) {
    stop("Unable to import", path);
  } else if (type == 'json') {
    // parsing JSON here so input file can be gc'd before JSON data is imported
    // TODO: look into incrementally parsing JSON data
    try {
      // JSON data may already be parsed if imported via applyCommands()
      if (utils.isString(content)) {
        content = JSON.parse(content);
      }
    } catch(e) {
      stop("Unable to parse JSON");
    }
  }
  input[type] = {filename: path, content: content};
  content = null; // for g.c.
  if (type == 'shp' || type == 'dbf') {
    MapShaper.readShapefileAuxFiles(path, input, cache);
  }
  if (type == 'shp' && !input.dbf) {
    message(utils.format("[%s] .dbf file is missing - shapes imported without attribute data.", path));
  }
  return MapShaper.importContent(input, opts);
};

/*
api.importDataTable = function(path, opts) {
  // TODO: avoid the overhead of importing shape data, if present
  var dataset = api.importFile(path, opts);
  if (dataset.layers.length > 1) {
    // if multiple layers are imported (e.g. from multi-type GeoJSON), throw away
    // the geometry and merge them
    dataset.layers.forEach(function(lyr) {
      lyr.shapes = null;
      lyr.geometry_type = null;
    });
    dataset.layers = api.mergeLayers(dataset.layers);
  }
  return dataset.layers[0].data;
};
*/

MapShaper.readShapefileAuxFiles = function(path, obj, cache) {
  var dbfPath = utils.replaceFileExtension(path, 'dbf');
  var cpgPath = utils.replaceFileExtension(path, 'cpg');
  var prjPath = utils.replaceFileExtension(path, 'prj');
  if (cli.isFile(prjPath, cache)) {
    obj.prj = {filename: prjPath, content: cli.readFile(prjPath, 'utf-8', cache)};
  }
  if (!obj.dbf && cli.isFile(dbfPath, cache)) {
    obj.dbf = {filename: dbfPath, content: cli.readFile(dbfPath, null, cache)};
  }
  if (obj.dbf && cli.isFile(cpgPath, cache)) {
    obj.cpg = {filename: cpgPath, content: cli.readFile(cpgPath, 'utf-8', cache).trim()};
  }
};
