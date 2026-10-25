import { runningInBrowser } from '../mapshaper-env';
import require from '../mapshaper-require';
import { stop } from '../utils/mapshaper-logging';
import { decodeElevationPixels } from './mapshaper-elevation-decoding';
import { getTileRangeMercatorBBox, wrapTileX } from './mapshaper-tile-math';
import { decodeWebP, isWebP } from './mapshaper-webp-decoder';

export var ELEVATION_NODATA = -32768;

var CONCURRENCY = 6;
var RETRIES = 2;

// Fetches the tiles in @range and composites their elevations into one
// Float32 grid in Web Mercator.
// Returns {grid, missing, headerValues}
export async function fetchElevationMosaic(source, range) {
  var tileSize = source.tile_size;
  var cols = range.x1 - range.x0 + 1;
  var rows = range.y1 - range.y0 + 1;
  var width = cols * tileSize;
  var height = rows * tileSize;
  var samples = new Float32Array(width * height).fill(ELEVATION_NODATA);
  var bbox = getTileRangeMercatorBBox(range);
  var jobs = [];
  var missing = 0;
  var headerValues = [];
  var x, y;
  for (y = range.y0; y <= range.y1; y++) {
    for (x = range.x0; x <= range.x1; x++) {
      jobs.push({x: x, y: y});
    }
  }
  await runWithConcurrency(jobs, CONCURRENCY, async function(job) {
    var url = getTileUrl(source, range.z, wrapTileX(job.x, range.z), job.y);
    var tile = await fetchTile(url, source);
    var elev;
    if (!tile) {
      missing++;
      return;
    }
    if (tile.header) headerValues.push(tile.header);
    if (tile.width != tileSize || tile.height != tileSize) {
      stop('Expected ' + tileSize + 'x' + tileSize + ' pixel tiles, received ' +
        tile.width + 'x' + tile.height + ' from', url);
    }
    elev = decodeElevationPixels(tile.rgba, source.encoding, ELEVATION_NODATA);
    copyTile(elev, tileSize, samples, width, (job.x - range.x0) * tileSize, (job.y - range.y0) * tileSize);
  });
  return {
    grid: {
      width: width,
      height: height,
      bands: 1,
      pixelType: 'float32',
      samples: samples,
      sampleBands: [0],
      nodata: ELEVATION_NODATA,
      bbox: bbox,
      transform: [
        (bbox[2] - bbox[0]) / width, 0, bbox[0],
        0, -(bbox[3] - bbox[1]) / height, bbox[3]
      ]
    },
    missing: missing,
    headerValues: headerValues
  };
}

export function getTileUrl(source, z, x, y) {
  var row = source.scheme == 'tms' ? Math.pow(2, z) - 1 - y : y;
  return source.url.replace('{z}', z).replace('{x}', x).replace('{y}', row);
}

function copyTile(elev, tileSize, dest, destWidth, x0, y0) {
  for (var y = 0; y < tileSize; y++) {
    dest.set(elev.subarray(y * tileSize, (y + 1) * tileSize), (y0 + y) * destWidth + x0);
  }
}

// Returns {rgba, width, height, header}, or null if the tile does not exist
async function fetchTile(url, source) {
  var resp, buf, decoded, err;
  if (typeof fetch != 'function') {
    stop('Fetching data requires a JavaScript runtime with fetch() (Node 18 or later)');
  }
  for (var attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      resp = await fetch(url);
      if (resp.status == 404 || resp.status == 403) return null; // S3 answers 403 for missing keys
      if (!resp.ok) throw new Error('HTTP status ' + resp.status);
      buf = await resp.arrayBuffer();
      decoded = await decodeTileImage(buf);
      decoded.header = source.sources_header && resp.headers && resp.headers.get ?
        resp.headers.get(source.sources_header) : null;
      return decoded;
    } catch(e) {
      err = e;
    }
  }
  stop('Unable to fetch', url + (err && err.message ? ' (' + err.message + ')' : '') +
    (runningInBrowser() ? '. Possible causes include no network connection, or a server that does not allow cross-domain requests (CORS).' : ''));
}

async function decodeTileImage(buf) {
  var webp = isWebP(new Uint8Array(buf, 0, Math.min(buf.byteLength, 16)));
  var png;
  if (runningInBrowser()) return decodeImageInBrowser(buf, webp ? 'image/webp' : 'image/png');
  if (webp) return decodeWebP(buf);
  png = require('pngjs').PNG.sync.read(Buffer.from(buf));
  return {rgba: png.data, width: png.width, height: png.height};
}

// Color management would alter the encoded elevation values, so it is
// turned off.
async function decodeImageInBrowser(buf, type) {
  var blob = new Blob([buf], {type: type});
  var bitmap = await createImageBitmap(blob, {colorSpaceConversion: 'none', premultiplyAlpha: 'none'});
  var w = bitmap.width, h = bitmap.height;
  var canvas = typeof OffscreenCanvas != 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  var ctx, data;
  canvas.width = w;
  canvas.height = h;
  ctx = canvas.getContext('2d', {willReadFrequently: true});
  ctx.drawImage(bitmap, 0, 0);
  data = ctx.getImageData(0, 0, w, h).data;
  if (bitmap.close) bitmap.close();
  return {rgba: data, width: w, height: h};
}

async function runWithConcurrency(items, limit, fn) {
  var next = 0;
  var workers = [];
  for (var i = 0; i < Math.min(limit, items.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  async function worker() {
    while (next < items.length) {
      await fn(items[next++]);
    }
  }
}
