import { gzipSync as _gzipSync, gunzipSync as _gunzipSync, strToU8, strFromU8 } from 'fflate';
import { isImportableAsBinary } from '../io/mapshaper-file-types';

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
  return _gzipSync(content, opts);
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
