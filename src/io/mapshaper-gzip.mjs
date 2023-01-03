import { gzipSync as _gzipSync, gunzipSync as _gunzipSync, strToU8, strFromU8 } from 'fflate';
import { isImportableAsBinary } from '../io/mapshaper-file-types';

export function gzipSync(content) {
  // TODO: use native module in Node if available
  // require('zlib').
  if (typeof content == 'string') {
    content = strToU8(content);
  }
  return _gzipSync(content);
}

export function gunzipSync(buf, filename) {
  // TODO: use native module in Node
  // require('zlib').
  if (buf instanceof ArrayBuffer) {
    buf = new Uint8Array(buf);
  }
  var out = _gunzipSync(buf); // returns Uint8Array
  if (!isImportableAsBinary(filename)) {
    out = strFromU8(out);
  }
  return out;
}
