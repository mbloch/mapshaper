import { runningInBrowser } from '../mapshaper-env';
import require from '../mapshaper-require';
import { stop } from '../utils/mapshaper-logging';
import { decodeElevationPixels } from './mapshaper-elevation-decoding';
import { getTileRangeMercatorBBox, wrapTileX } from './mapshaper-tile-math';
import { decodeWebP, isWebP } from './mapshaper-webp-decoder';

export var ELEVATION_NODATA = -32768;

var CONCURRENCY = 6;
var RETRIES = 2;

// Fetches the tiles in @range and composites them into one grid in Web
// Mercator: a Float32 grid of elevations, or for imagery (encoding "rgb") an
// RGB grid whose coverage mask excludes missing tiles and transparent pixels.
// Returns {grid, missing, headerValues}
export async function fetchTileMosaic(source, range) {
  var tileSize = source.tile_size;
  var cols = range.x1 - range.x0 + 1;
  var rows = range.y1 - range.y0 + 1;
  var width = cols * tileSize;
  var height = rows * tileSize;
  var imagery = source.encoding == 'rgb';
  var samples = imagery ? new Uint8Array(width * height * 3) :
    new Float32Array(width * height).fill(ELEVATION_NODATA);
  var coverage = imagery ? new Uint8Array(width * height) : null;
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
    var x0, y0;
    if (!tile) {
      missing++;
      return;
    }
    if (tile.header) headerValues.push(tile.header);
    if (tile.width != tileSize || tile.height != tileSize) {
      stop('Expected ' + tileSize + 'x' + tileSize + ' pixel tiles, received ' +
        tile.width + 'x' + tile.height + ' from', url);
    }
    x0 = (job.x - range.x0) * tileSize;
    y0 = (job.y - range.y0) * tileSize;
    if (imagery) {
      copyImageTile(tile.rgba, tileSize, samples, coverage, width, x0, y0);
    } else {
      copyTile(decodeElevationPixels(tile.rgba, source.encoding, ELEVATION_NODATA), tileSize, samples, width, x0, y0);
    }
  });
  return {
    grid: {
      width: width,
      height: height,
      bands: imagery ? 3 : 1,
      pixelType: imagery ? 'uint8' : 'float32',
      samples: samples,
      sampleBands: imagery ? [0, 1, 2] : [0],
      nodata: imagery ? null : ELEVATION_NODATA,
      coverage: coverage,
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

function copyImageTile(rgba, tileSize, dest, coverage, destWidth, x0, y0) {
  var x, y, src, i;
  for (y = 0; y < tileSize; y++) {
    src = y * tileSize * 4;
    i = (y0 + y) * destWidth + x0;
    for (x = 0; x < tileSize; x++, src += 4, i++) {
      if (rgba[src + 3] === 0) continue;
      dest[i * 3] = rgba[src];
      dest[i * 3 + 1] = rgba[src + 1];
      dest[i * 3 + 2] = rgba[src + 2];
      coverage[i] = 1;
    }
  }
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
  var head = new Uint8Array(buf, 0, Math.min(buf.byteLength, 16));
  var webp = isWebP(head);
  var jpeg = head[0] == 0xFF && head[1] == 0xD8;
  var png, image;
  if (runningInBrowser()) {
    return decodeImageInBrowser(buf, webp ? 'image/webp' : jpeg ? 'image/jpeg' : 'image/png');
  }
  if (webp) return decodeWebP(buf);
  if (jpeg) {
    image = require('jpeg-js').decode(Buffer.from(buf), {useTArray: true});
    return {rgba: image.data, width: image.width, height: image.height};
  }
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
