import { gzipSync as _gzipSync, gzip as _gzipAsync,  gunzipSync as _gunzipSync, gunzip as _gunzipAsync, strToU8, strFromU8 } from 'fflate';
import { isImportableAsBinary } from '../io/mapshaper-file-types';
import utils from '../utils/mapshaper-utils';
import { runningInBrowser } from '../mapshaper-env';

// Checks if @arg is a Uint8Array containing gzipped data
export function isGzipped(arg) {
  return arg.length > 2 && arg.buffer instanceof ArrayBuffer && arg[0] == 0x1f && arg[1] == 0x8b;
}

export function gzipSync(content, opts) {
  // TODO: use native module in Node if available
  // require('zlib').
  if (typeof content == 'string') {
    content = strToU8(content);
  }
  if (runningInBrowser()) {
    return _gzipSync(content, opts);
  }
  return require('zlib').gzipSync(content, opts);
}

export async function gzipAsync(content, opts) {
  if (typeof content == 'string') {
    content = strToU8(content);
  }
  var gzip = runningInBrowser() ? utils.promisify(_gzipAsync) : utils.promisify(require('zlib').gzip);
  return gzip(content, opts);
}

export async function gunzipAsync(buf, opts) {
  if (buf instanceof ArrayBuffer) {
    buf = new Uint8Array(buf);
  }
  opts = opts || {};
  var out = await utils.promisify(_gunzipAsync)(buf, opts);
  if (opts.filename && !isImportableAsBinary(opts.filename)) {
    out = strFromU8(out);
  }
  return out;
}

export function gunzipSync(buf, filename) {
  // TODO: use native module in Node
  // require('zlib').
  if (buf instanceof ArrayBuffer) {
    buf = new Uint8Array(buf);
  }
  var out = _gunzipSync(buf); // returns Uint8Array
  if (filename && !isImportableAsBinary(filename)) {
    out = strFromU8(out);
  }
  return out;
}
