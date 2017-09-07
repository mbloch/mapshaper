/* @requires
mapshaper-import
dbf-import
*/

api.importFiles = function(opts) {
  var files = opts.files || [],
      dataset;

  if (opts.stdin) {
    return api.importFile('/dev/stdin', opts);
  }

  if (files.length > 0 === false) {
    stop('Missing input file(s)');
  }

  if (files.length == 1) {
    dataset = api.importFile(files[0], opts);
  } else if (opts.merge_files) {
    // TODO: deprecate and remove this option (use -merge-layers cmd instead)
    dataset = internal.importFiles(files, opts);
    dataset.layers = api.mergeLayers(dataset.layers);
  } else if (opts.combine_files) {
    dataset = internal.importFiles(files, opts);
  } else {
    stop('Invalid inputs');
  }
  return dataset;
};

api.importFile = function(path, opts) {
  var isBinary = internal.isBinaryFile(path),
      apparentType = internal.guessInputFileType(path),
      input = {},
      encoding = opts && opts.encoding || null,
      cache = opts && opts.input || null,
      cached = cache && (path in cache),
      type, content;

  cli.checkFileExists(path, cache);
  if (apparentType == 'shp' && !cached) {
    // let ShpReader read the file (supports larger files)
    content = null;
  } else if (apparentType == 'json' && !cached) {
    // postpone reading of JSON files, to support incremental parsing
    content = null;
  } else if (apparentType == 'text' && !cached) {
    content = cli.readFile(path); // read from buffer, to support larger files
    // content = null // read incrementally from file, to support largest files
  } else if (isBinary) {
    content = cli.readFile(path, null, cache);
  } else { // assuming text file
    content = cli.readFile(path, encoding || 'utf-8', cache);
  }
  type = apparentType || internal.guessInputContentType(content);
  if (!type) {
    stop("Unable to import", path);
  }
  input[type] = {filename: path, content: content};
  content = null; // for g.c.
  if (type == 'shp' || type == 'dbf') {
    internal.readShapefileAuxFiles(path, input, cache);
  }
  if (type == 'shp' && !input.dbf) {
    message(utils.format("[%s] .dbf file is missing - shapes imported without attribute data.", path));
  }
  return internal.importContent(input, opts);
};

internal.readShapefileAuxFiles = function(path, obj, cache) {
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
