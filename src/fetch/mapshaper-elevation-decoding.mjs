import { stop } from '../utils/mapshaper-logging';

// Elevation encodings used by RGB terrain tiles. Pixels whose alpha is 0
// (tile padding, or areas without data) get @nodata.

export var ELEVATION_ENCODINGS = ['terrarium', 'mapbox'];

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
