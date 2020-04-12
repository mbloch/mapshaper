import { importContent } from '../io/mapshaper-import';
import { isSupportedBinaryInputType, guessInputContentType, guessInputFileType } from '../io/mapshaper-file-types';
import { importFiles } from '../cli/mapshaper-merge-files';
import cmd from '../mapshaper-cmd';
import cli from '../cli/mapshaper-cli-utils';
import utils from '../utils/mapshaper-utils';
import { message, verbose, stop } from '../utils/mapshaper-logging';
import { getFileExtension, replaceFileExtension } from '../utils/mapshaper-filename-utils';

cmd.importFiles = function(opts) {
  var files = opts.files || [],
      dataset;

  if (opts.stdin) {
    return importFile('/dev/stdin', opts);
  }

  if (files.length > 0 === false) {
    stop('Missing input file(s)');
  }

  verbose("Importing: " + files.join(' '));

  if (files.length == 1) {
    dataset = importFile(files[0], opts);
  } else if (opts.merge_files) {
    // TODO: deprecate and remove this option (use -merge-layers cmd instead)
    dataset = importFiles(files, opts);
    dataset.layers = cmd.mergeLayers(dataset.layers);
  } else if (opts.combine_files) {
    dataset = importFiles(files, opts);
  } else {
    stop('Invalid inputs');
  }
  return dataset;
};

// Let the web UI replace importFile() with a browser-friendly version
export function replaceImportFile(func) {
  _importFile = func;
}

export function importFile(path, opts) {
  return _importFile(path, opts);
}

var _importFile = function(path, opts) {
  var fileType = guessInputFileType(path),
      input = {},
      encoding = opts && opts.encoding || null,
      cache = opts && opts.input || null,
      cached = cache && (path in cache),
      content;

  cli.checkFileExists(path, cache);
  if (fileType == 'shp' && !cached) {
    // let ShpReader read the file (supports larger files)
    content = null;

  } else if (fileType == 'json' && !cached) {
    // postpone reading of JSON files, to support incremental parsing
    content = null;

  } else if (fileType == 'text' && !cached) {
    // content = cli.readFile(path); // read from buffer
    content = null; // read from file, to support largest files (see mapshaper-delim-import.js)

  } else if (fileType && isSupportedBinaryInputType(path)) {
    content = cli.readFile(path, null, cache);
    if (utils.isString(content)) {
      // Fix for issue #264 (applyCommands() input is file path instead of binary content)
      stop('Expected binary content, received a string');
    }

  } else if (fileType) { // string type
    content = cli.readFile(path, encoding || 'utf-8', cache);

  } else { // type can't be inferred from filename -- try reading as text
    content = cli.readFile(path, encoding || 'utf-8', cache);
    fileType = guessInputContentType(content);
    if (fileType == 'text' && content.indexOf('\ufffd') > -1) {
      // invalidate string data that contains the 'replacement character'
      fileType = null;
    }
  }

  if (!fileType) {
    stop(getUnsupportedFileMessage(path));
  }
  input[fileType] = {filename: path, content: content};
  content = null; // for g.c.
  if (fileType == 'shp' || fileType == 'dbf') {
    readShapefileAuxFiles(path, input, cache);
  }
  if (fileType == 'shp' && !input.dbf) {
    message(utils.format("[%s] .dbf file is missing - shapes imported without attribute data.", path));
  }
  return importContent(input, opts);
};

function getUnsupportedFileMessage(path) {
  var ext = getFileExtension(path);
  var msg = 'Unable to import ' + path;
  if (ext.toLowerCase() == 'zip') {
    msg += ' (ZIP files must be unpacked before running mapshaper)';
  } else {
    msg += ' (unknown file type)';
  }
  return msg;
}

function readShapefileAuxFiles(path, obj, cache) {
  var dbfPath = replaceFileExtension(path, 'dbf');
  var shxPath = replaceFileExtension(path, 'shx');
  var cpgPath = replaceFileExtension(path, 'cpg');
  var prjPath = replaceFileExtension(path, 'prj');
  if (cli.isFile(prjPath, cache)) {
    obj.prj = {filename: prjPath, content: cli.readFile(prjPath, 'utf-8', cache)};
  }
  if (cli.isFile(shxPath, cache)) {
    obj.shx = {filename: shxPath, content: cli.readFile(shxPath, null, cache)};
  }
  if (!obj.dbf && cli.isFile(dbfPath, cache)) {
    obj.dbf = {filename: dbfPath, content: cli.readFile(dbfPath, null, cache)};
  }
  if (obj.dbf && cli.isFile(cpgPath, cache)) {
    obj.cpg = {filename: cpgPath, content: cli.readFile(cpgPath, 'utf-8', cache).trim()};
  }
}
