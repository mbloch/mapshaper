import { stop, error } from '../utils/mapshaper-logging';
import { parseLocalPath, toLowerCaseExtension } from '../utils/mapshaper-filename-utils';
import { looksLikeContentFile, isImportableAsBinary } from '../io/mapshaper-file-types';
import { zipSync as _zipSync, unzipSync as _unzipSync, zip as _zip, unzip as _unzip, strToU8, strFromU8 } from 'fflate';
import { runningInBrowser } from '../mapshaper-env';

// input: A file path or a buffer
export function unzipSync(input) {
  if (input instanceof ArrayBuffer) {
    input = new Uint8Array(input);
  }
  if (!runningInBrowser()) {
    return unzipSyncNode(input);
  }
  var obj = _unzipSync(input, {filter: fflateFilter});
  return fflatePostprocess(obj);
}

export function unzipAsync(buf, cb) {
  if (!runningInBrowser()) {
    error('Async unzipping only supported in the browser');
  }
  if (buf instanceof ArrayBuffer) {
    buf = new Uint8Array(buf);
  }
  _unzip(buf, {filter: fflateFilter}, function(err, data) {
    if (err) cb(err);
    cb(null, fflatePostprocess(data));
  });
}

export function zipSync(files) {
  if (runningInBrowser()) {
    return _zipSync(fflatePreprocess(files));
  }
  return zipSyncNode(files);
}

export function zipAsync(files, cb) {
  _zip(fflatePreprocess(files), {}, cb);
}

function fflateFilter(file) {
  return isImportableZipPath(file.name);
}

function fflatePostprocess(output) {
  return Object.keys(output).reduce(function(memo, path) {
    var file = parseLocalPath(path).filename;
    var content = output[path];
    if (!isImportableAsBinary(file)) {
      content = strFromU8(content);
    }
    memo[file] = content;
    return memo;
  }, {});
}

export function isImportableZipPath(name) {
  var info = parseLocalPath(name);
  return looksLikeContentFile(name) &&
    !/^__MACOSX/.test(name) && // ignore "resource-fork" files
    info.filename[0] != '.'; // ignore dot files
}

// input: input file path or a Buffer containing .zip file bytes
function unzipSyncNode(input) {
  var zip = new require('adm-zip')(input);
  var index = {};
  zip.getEntries().forEach(function(entry) {
    // entry.entryName // path, including filename
    // entry.name      // filename
    var file = toLowerCaseExtension(entry.name);
    if (isImportableZipPath(file)) {
      index[file] = entry.getData();
    }
  });
  return index;
}

function zipSyncNode(files) {
  var zip = new require('adm-zip')();
  files.forEach(function(o) {
    var buf = o.content;
    if (buf instanceof ArrayBuffer) {
      buf = new Uint8Array(buf);
    } else if (!(buf instanceof Buffer || buf instanceof Uint8Array)) {
      buf = Buffer.from(o.content);
    }
    zip.addFile(o.filename, buf);
    // delete o.content; // for gc?
  });
  return zip.toBuffer();
}

// Convert array of output file data to input format used by fflate zip
function fflatePreprocess(files) {
  var obj = {};
  files.forEach(function(file) {
    if (typeof file.content == 'string') {
      file.content = strToU8(file.content);
    } else if (file.content instanceof ArrayBuffer) {
      file.content = new Uint8Array(file.content);
    }
    obj[file.filename] = file.content;
  });
  return obj;
}