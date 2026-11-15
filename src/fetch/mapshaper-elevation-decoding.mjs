import { stop } from '../utils/mapshaper-logging';

// Elevation encodings used by RGB terrain tiles. Pixels whose alpha is 0
// (tile padding, or areas without data) get @nodata. "bsq" tiles are not
// images: they are float32 values (see decodeBsqTile).

export var ELEVATION_ENCODINGS = ['terrarium', 'mapbox', 'bsq'];

// "rgb" tiles are imagery, kept as colors
export var TILE_ENCODINGS = ELEVATION_ENCODINGS.concat('rgb');

export function validateTileEncoding(encoding) {
  if (!TILE_ENCODINGS.includes(encoding)) {
    stop('Unsupported tile encoding:', encoding + '.', 'Use one of:', TILE_ENCODINGS.join(', '));
  }
}

export function validateElevationEncoding(encoding) {
  if (!ELEVATION_ENCODINGS.includes(encoding)) {
    stop('Unsupported tile encoding:', encoding + '.', 'Use one of:', ELEVATION_ENCODINGS.join(', '));
  }
}

// @rgba RGBA bytes of a decoded tile
// Returns a Float32Array of elevations in meters
export function decodeElevationPixels(rgba, encoding, nodata) {
  var n = rgba.length / 4;
  var out = new Float32Array(n);
  var terrarium = encoding == 'terrarium';
  var i, j, r, g, b;
  validateElevationEncoding(encoding);
  for (i = 0, j = 0; i < n; i++, j += 4) {
    if (rgba[j + 3] === 0) {
      out[i] = nodata;
      continue;
    }
    r = rgba[j];
    g = rgba[j + 1];
    b = rgba[j + 2];
    out[i] = terrarium ?
      r * 256 + g + b / 256 - 32768 :
      -10000 + (r * 65536 + g * 256 + b) * 0.1;
  }
  return out;
}

// A square tile from an ArcGIS ImageServer exportImage request with
// format=bsq&pixelType=F32: little-endian float32 values by row, then a
// validity mask with one bit per pixel (first pixel in the high bit)
// @buf ArrayBuffer
// Returns {elevations, width, height}; throws if @buf is something else, e.g.
//   the JSON error message the server sends instead (with HTTP status 200)
export function decodeBsqTile(buf, size, nodata) {
  var n = size * size;
  var maskOffset = n * 4;
  var bytes = new Uint8Array(buf);
  var view, out, i;
  if (bytes.length != maskOffset + Math.ceil(n / 8)) {
    throw new Error(getServerError(bytes) || 'Expected a ' + size + 'x' + size + ' float32 tile, received ' + bytes.length + ' bytes');
  }
  view = new DataView(buf);
  out = new Float32Array(n);
  for (i = 0; i < n; i++) {
    out[i] = bytes[maskOffset + (i >> 3)] & (128 >> (i & 7)) ? view.getFloat32(i * 4, true) : nodata;
  }
  return {elevations: out, width: size, height: size};
}

function getServerError(bytes) {
  var str, json;
  if (bytes[0] != 0x7B) return null; // {
  try {
    str = new TextDecoder().decode(bytes);
    json = JSON.parse(str);
  } catch(e) {
    return null;
  }
  return json && json.error ? 'Server error: ' + (json.error.message || JSON.stringify(json.error)) : null;
}
