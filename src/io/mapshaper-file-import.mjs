import { importContent, importDatasetsFromContent } from '../io/mapshaper-import';
import {
  isSupportedBinaryInputType,
  guessInputContentType,
  guessInputFileType,
  isAuxiliaryInputFileType,
  isRasterImageInputType,
  isWorldFileExtension,
  isZipFile,
  isKmzFile,
  stringLooksLikeJSON,
  stringLooksLikeCsv,
  unescapeInlineCsv,
  isPackageFile } from '../io/mapshaper-file-types';
import cmd from '../mapshaper-cmd';
import cli from '../cli/mapshaper-cli-utils';
import utils from '../utils/mapshaper-utils';
import { message, verbose, stop } from '../utils/mapshaper-logging';
import { parseLocalPath, getFileBase, getFileExtension, replaceFileExtension } from '../utils/mapshaper-filename-utils';
import { trimBOM, decodeString } from '../text/mapshaper-encodings';
import { unzipSync } from './mapshaper-zip';
import { gunzipSync } from './mapshaper-gzip';
import { unpackSessionData } from '../pack/mapshaper-unpack';
import { buildTopology } from '../topology/mapshaper-topology';
import { cleanPathsAfterImport } from '../paths/mapshaper-path-import';
import { mergeDatasets } from '../dataset/mapshaper-merging';
import { formatVersionedFileName } from '../io/mapshaper-export';

cmd.importFiles = async function(catalog, opts) {
  var files = opts.files || [];
  var dataset, datasets, target;

  if (opts.stdin) {
    datasets = await importDatasetsFromFile('/dev/stdin', opts);
    catalog.addDatasets(datasets);
    if (datasets.length > 1) {
      catalog.setDefaultTargets(datasets.map(function(ds) {
        return {dataset: ds, layers: ds.layers};
      }));
    }
    return normalizeImportedTarget(datasets);
  }

  if (files.length > 0 === false) {
    stop('Missing input file(s)');
  }

  verbose("Importing: " + files.join(' '));

  // copy opts, so parameters can be modified within this command
  opts = Object.assign({}, opts);
  opts.input = Object.assign({}, opts.input); // make sure we have a cache

  convertDataObjects(files, opts.input);

  files = expandFiles(files, opts.input);

  if (files.length === 0) {
    stop('Missing importable files');
  }

  // special case: package file
  if (files.some(isPackageFile)) {
    if (files.length > 1) {
      stop('Expected a single package file');
    }
    dataset = await importMshpFile(files[0], catalog, opts);
    return dataset;
  }

  if (files.length == 1) {
    datasets = await importDatasetsFromFile(files[0], opts);
  } else {
    dataset = await importFilesTogetherAsync(files, opts);
    datasets = [dataset];
  }
  datasets = validateAndCleanGpkgSelection(datasets, opts);

  if (opts.merge_files && files.length > 1) {
    // TODO: deprecate and remove this option (use -merge-layers cmd instead)
    datasets[0].layers = cmd.mergeLayers(datasets[0].layers);
  }

  catalog.addDatasets(datasets);
  if (datasets.length > 1) {
    catalog.setDefaultTargets(datasets.map(function(ds) {
      return {dataset: ds, layers: ds.layers};
    }));
  }
  target = normalizeImportedTarget(datasets);
  return target;
};

// Replace any inline data strings (JSON objects/arrays or comma-delimited
// text) with synthetic filenames and stash the content in @cache so the
// downstream importer can read it as if it had come from a file.
function convertDataObjects(files, cache) {
  var slots = files.map(classifyInlineData);
  var inlineCount = slots.filter(Boolean).length;
  if (inlineCount === 0) return;
  if (inlineCount > 1) {
    // ensure unique filenames when multiple inline strings are passed together
    var names = slots.filter(Boolean).map(function(s) { return s.filename; });
    var unique = utils.uniqifyNames(names, formatVersionedFileName);
    var idx = 0;
    slots.forEach(function(slot) {
      if (slot) slot.filename = unique[idx++];
    });
  }
  slots.forEach(function(slot, i) {
    if (!slot) return;
    cache[slot.filename] = slot.content;
    files[i] = slot.filename;
  });
}

function classifyInlineData(str) {
  if (stringLooksLikeJSON(str)) {
    return {filename: 'layer.json', content: str};
  }
  if (stringLooksLikeCsv(str)) {
    return {filename: 'layer.csv', content: unescapeInlineCsv(str)};
  }
  return null;
}

async function importMshpFile(file, catalog, opts) {
  var buf = cli.readFile(file, null, opts.input);
  var obj = await unpackSessionData(buf);
  obj.datasets.forEach(catalog.addDataset, catalog);
  return obj.target;
}

function expandFiles(files, cache) {
  var files2 = [];
  files.forEach(function(file) {
    var expanded;
    if (isZipFile(file)) {
      expanded = expandZipFile(file, cache);
    } else if (isKmzFile(file)) {
      expanded = expandKmzFile(file, cache);
    } else {
      expanded = [file]; // ordinary file, no change
    }
    files2 = files2.concat(expanded);
  });
  return files2;
}

function expandKmzFile(file, cache) {
  var files = expandZipFile(file, cache);
  var name = replaceFileExtension(parseLocalPath(file).filename, 'kml');
  files = files.map(function(file) {
    if (file == 'doc.kml') {
      return name;
    }
    return file;
  });
  if ('doc.kml' in cache) {
    cache[name] = cache['doc.kml'];
  }
  return files.filter(function(file) {
    return guessInputFileType(file) == 'kml';
  });
}

function expandZipFile(file, cache) {
  var input;
  if (file in cache) {
    input = cache[file];
  } else {
    input = file;
    cli.checkFileExists(file);
  }
  var index = unzipSync(input);
  Object.assign(cache, index);
  return findPrimaryFiles(index);
}

// Return the names of primary files in a file cache
// (exclude auxiliary files, which can't be converted into datasets)
function findPrimaryFiles(cache) {
  return Object.keys(cache).filter(function(filename) {
    var type = guessInputFileType(filename);
    if (type == 'dbf') {
      // don't import .dbf separately if .shp is present
      if (replaceFileExtension(filename, 'shp') in cache) return false;
    }
    return type && !isAuxiliaryInputFileType(type);
  });
}

// Let the web UI replace path-based imports with a browser-friendly resolver.
export function replaceImportFile(func) {
  _importFile = func;
  _importDatasetsFromFile = async function(path, opts) {
    return normalizeImportedDatasets(await func(path, opts));
  };
}

export function importFile(path, opts) {
  return _importFile(path, opts);
}

export async function importFileAsync(path, opts) {
  return denormalizeImportedDatasets(await importDatasetsFromFile(path, opts));
}

// Canonical path import interface.
export async function importDatasetsFromFile(path, opts) {
  return _importDatasetsFromFile(path, opts);
}

var _importFile = function(path, opts) {
  var input = prepareImportFile(path, opts);
  return importContent(input, opts);
};

var _importDatasetsFromFile = async function(path, opts) {
  var input = prepareImportFile(path, opts);
  return importDatasetsFromContent(input, opts);
};

// Read a file (or cache entry) and collect any sidecars into the normalized
// content-group shape consumed by the content importers.
// File acquisition is currently synchronous in both import paths; only some
// format parsers require asynchronous work.
function prepareImportFile(path, opts) {
  var fileType = guessInputFileType(path),
      input = {},
      encoding = opts && opts.encoding || null,
      cache = opts && opts.input || null,
      cached = cache && (path in cache),
      content;

  cli.checkFileExists(path, cache);

  if ((fileType == 'shp' || fileType == 'json' || fileType == 'text' || fileType == 'dbf' ||
      fileType == 'gpkg') && !cached) {
    // these file types are read incrementally
    content = null;

  } else if (fileType && isSupportedBinaryInputType(path)) {
    content = cli.readFile(path, null, cache);
    if (utils.isString(content)) {
      stop('Expected binary content, received a string');
    }

  } else if (fileType) {
    content = cli.readFile(path, encoding || 'utf-8', cache);

  } else if (getFileExtension(path) == 'gz') {
    var pathgz = path;
    path = pathgz.replace(/\.gz$/, '');
    fileType = guessInputFileType(path);
    if (!fileType) {
      stop('Unrecognized file type:', path);
    }
    content = gunzipSync(cli.readFile(pathgz, null, cache), path);

  } else {
    content = cli.readFile(path, encoding || 'utf-8', cache);
    fileType = guessInputContentType(content);
    if (fileType == 'text' && content.indexOf('\ufffd') > -1) {
      fileType = null;
    }
  }

  if (!fileType) {
    stop(getUnsupportedFileMessage(path));
  }
  input[fileType] = {filename: path, content: content};
  content = null;
  if (fileType == 'shp' || fileType == 'dbf') {
    readShapefileAuxFiles(path, input, cache);
  } else if (isRasterImageInputType(fileType)) {
    readRasterImageAuxFiles(path, input, cache);
  }
  if (fileType == 'shp' && !input.dbf) {
    message(utils.format("[%s] .dbf file is missing - shapes imported without attribute data.", path));
  }
  return input;
}

// Import multiple files to a single dataset.
export async function importFilesTogetherAsync(files, opts) {
  var unbuiltTopology = false;
  var datasets = [];
  files = removeRasterImageSidecars(files);
  for (var fname of files) {
    // import without topology or snapping
    var importOpts = utils.defaults({no_topology: true, snap: false, snap_interval: null, files: [fname]}, opts);
    var imported = await importDatasetsFromFile(fname, importOpts);
    imported.forEach(function(dataset) {
      if (dataset.arcs && dataset.arcs.size() > 0 && dataset.info.input_formats[0] != 'topojson') {
        unbuiltTopology = true;
      }
      datasets.push(dataset);
    });
  }
  datasets = validateAndCleanGpkgSelection(datasets, opts);
  var combined = mergeDatasets(datasets);
  if (unbuiltTopology && !opts.no_topology) {
    cleanPathsAfterImport(combined, opts);
    buildTopology(combined);
  }
  return combined;
}

// Validate the GeoPackage layers= selection across all imported datasets,
// remove any placeholder datasets produced by filter misses, and strip the
// bookkeeping metadata attached by the GeoPackage importer.
function validateAndCleanGpkgSelection(datasets, opts) {
  var availableSet = new Set();
  var importedSet = new Set();
  var sawGpkg = false;
  datasets.forEach(function(ds) {
    var info = ds && ds.info;
    if (!info || !Array.isArray(info._gpkg_available_layers)) return;
    sawGpkg = true;
    info._gpkg_available_layers.forEach(function(name) { availableSet.add(name); });
    if (!info._gpkg_placeholder) {
      (ds.layers || []).forEach(function(lyr) {
        if (lyr && lyr.name) importedSet.add(lyr.name);
      });
    }
  });
  if (sawGpkg && Array.isArray(opts.layers) && opts.layers.length > 0) {
    var missing = opts.layers.filter(function(name) {
      return !importedSet.has(name);
    });
    if (missing.length > 0) {
      stop(
        'Missing GeoPackage layer(s): ' + missing.join(', ') + '\n' +
        'Existing layers: ' + Array.from(availableSet).join(' ')
      );
    }
  }
  var cleaned = datasets.filter(function(ds) {
    return !(ds && ds.info && ds.info._gpkg_placeholder);
  });
  cleaned.forEach(function(ds) {
    if (ds && ds.info) {
      delete ds.info._gpkg_available_layers;
      delete ds.info._gpkg_placeholder;
    }
  });
  return cleaned;
}

function normalizeImportedDatasets(datasetOrArray) {
  return Array.isArray(datasetOrArray) ? datasetOrArray : [datasetOrArray];
}

function denormalizeImportedDatasets(datasets) {
  return datasets.length == 1 ? datasets[0] : datasets;
}

function normalizeImportedTarget(datasets) {
  if (datasets.length == 1) return datasets[0];
  return {
    layers: datasets.reduce(function(memo, dataset) {
      return memo.concat(dataset.layers);
    }, [])
  };
}

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
    // obj.dbf = {filename: dbfPath, content: cli.readFile(dbfPath, null, cache)};
    obj.dbf = {
      filename: dbfPath,
      content: (cache && (dbfPath in cache)) ? cli.readFile(dbfPath, null, cache) : null
    };
  }
  if (obj.dbf && cli.isFile(cpgPath, cache)) {
    obj.cpg = {filename: cpgPath, content: cli.readFile(cpgPath, 'utf-8', cache).trim()};
  }
}

function readRasterImageAuxFiles(path, obj, cache) {
  var prjPath = replaceFileExtension(path, 'prj');
  var worldPath = findWorldFile(path, cache);
  if (cli.isFile(prjPath, cache)) {
    obj.prj = {filename: prjPath, content: cli.readFile(prjPath, 'utf-8', cache)};
  }
  if (worldPath) {
    obj.world = {filename: worldPath, content: cli.readFile(worldPath, 'utf-8', cache)};
  }
}

function findWorldFile(path, cache) {
  var candidates = getWorldFileCandidates(path);
  for (var i = 0; i < candidates.length; i++) {
    if (cli.isFile(candidates[i], cache)) return candidates[i];
  }
  return null;
}

function getWorldFileCandidates(path) {
  var ext = getFileExtension(path).toLowerCase();
  var candidates = [replaceFileExtension(path, 'wld'), replaceFileExtension(path, 'tfw')];
  if (ext == 'png') {
    candidates.unshift(replaceFileExtension(path, 'pgw'), replaceFileExtension(path, 'pngw'));
  } else if (ext == 'jpg' || ext == 'jpeg') {
    candidates.unshift(
      replaceFileExtension(path, 'jgw'),
      replaceFileExtension(path, 'jpw'),
      replaceFileExtension(path, 'jpgw'),
      replaceFileExtension(path, 'jpegw')
    );
  }
  return utils.uniq(candidates);
}

function removeRasterImageSidecars(files) {
  var imageBases = {};
  files.forEach(function(file) {
    var type = guessInputFileType(file);
    if (isRasterImageInputType(type)) {
      imageBases[getFileBase(file).toLowerCase()] = true;
    }
  });
  return files.filter(function(file) {
    var ext = getFileExtension(file).toLowerCase();
    var type = guessInputFileType(file);
    var base = getFileBase(file).toLowerCase();
    if ((type == 'prj' || isWorldFileExtension(ext)) && imageBases[base]) {
      return false;
    }
    return true;
  });
}
