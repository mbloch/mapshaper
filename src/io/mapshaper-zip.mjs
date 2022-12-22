import { stop } from '../utils/mapshaper-logging';
import { parseLocalPath, toLowerCaseExtension, replaceFileExtension, getFileExtension } from '../utils/mapshaper-filename-utils';
import { guessInputFileType } from '../io/mapshaper-file-types';

// input: input file path or a Buffer containing .zip file bytes
// cache: destination for extracted file contents
export function extractFiles(input, cache) {
  var zip = new require('adm-zip')(input);
  var files = zip.getEntries().map(function(entry) {
    // entry.entryName // path, including filename
    // entry.name      // filename
    var file = toLowerCaseExtension(entry.name);
    if (file[0] == '.') return ''; // skip hidden system file
    var type = guessInputFileType(file);
    if (!type) return ''; // skip unrecognized extensions
    cache[file] = entry.getData();
    return file;
  });
  // remove auxiliary files from the import list
  // (these are files that can't be converted into datasets);
  return files.filter(function(file) {
    if (!file) return false;
    var type = guessInputFileType(file);
    if (type == 'dbf') {
      // don't import .dbf separately if .shp is present
      if (replaceFileExtension(file, 'shp') in cache) return false;
    }
    return type == 'text' || type == 'json' || type == 'shp' || type == 'dbf' || type == 'kml';
  });
}

export function convertOutputFiles(files, opts) {
  var filename = opts.zipfile || 'output.zip';
  var dirname = parseLocalPath(filename).basename;
  var zip = new require('adm-zip')();
  files.forEach(function(o) {
    var ofile = require('path').join(dirname, o.filename);
    var buf = Buffer.from(o.content);
    if (buf instanceof ArrayBuffer) {
      buf = new Uint8Array(buf);
    }
    zip.addFile(ofile, buf);
    delete o.content; // for gc?
  });
  return [{
    filename: filename,
    content: zip.toBuffer()
  }];
}
