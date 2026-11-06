import { runningInBrowser } from '../mapshaper-env';
import require from '../mapshaper-require';
import { stop } from '../utils/mapshaper-logging';
import { decodeBsqTile, decodeElevationPixels } from './mapshaper-elevation-decoding';
import { usesBBoxToken } from './mapshaper-fetch-sources';
import { getTileRangeMercatorBBox, wrapTileX } from './mapshaper-tile-math';
import { decodeWebP, isWebP } from './mapshaper-webp-decoder';

export var ELEVATION_NODATA = -32768;

var CONCURRENCY = 6;
var RETRIES = 3;
var RETRY_DELAY = 1000; // ms, doubled after each retry
var TIMEOUT = 60000; // ms per request

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
  var failed = 0, failure = null;
  await runWithConcurrency(jobs, CONCURRENCY, async function(job) {
    var url = getTileUrl(source, range.z, wrapTileX(job.x, range.z), job.y);
    var tile = await fetchTile(url, source);
    var x0, y0;
    if (!tile) {
      missing++;
      return;
    }
    if (tile.error) {
      failed++;
      failure = failure || tile;
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
      copyTile(tile.elevations || decodeElevationPixels(tile.rgba, source.encoding, ELEVATION_NODATA),
        tileSize, samples, width, x0, y0);
    }
  });
  if (failed == jobs.length) {
    stop('Unable to fetch', failure.url + ' (' + failure.error + ')' +
      (runningInBrowser() ? '. Possible causes include no network connection, or a server that does not allow cross-domain requests (CORS).' : ''));
  }
  return {
    grid: {
      width: width,
      height: height,
      bands: imagery ? 3 : 1,
      pixelType: imagery ? 'uint8' : 'float32',
      samples: samples,
      sampleBands: imagery ? [0, 1, 2] : [0],
      nodata: imagery ? null : ELEVATION_NODATA,
      // elevation tiles are decoded to meters
      verticalUnits: imagery ? undefined : 'm',
      coverage: coverage,
      bbox: bbox,
      transform: [
        (bbox[2] - bbox[0]) / width, 0, bbox[0],
        0, -(bbox[3] - bbox[1]) / height, bbox[3]
      ]
    },
    missing: missing,
    failed: failed,
    failure: failure,
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
  var url = source.url;
  if (usesBBoxToken(url)) {
    url = url.replace('{bbox-epsg-3857}', getTileRangeMercatorBBox({z: z, x0: x, x1: x, y0: y, y1: y}).join(','));
  }
  return url.replace('{z}', z).replace('{x}', x).replace('{y}', row);
}

function copyTile(elev, tileSize, dest, destWidth, x0, y0) {
  for (var y = 0; y < tileSize; y++) {
    dest.set(elev.subarray(y * tileSize, (y + 1) * tileSize), (y0 + y) * destWidth + x0);
  }
}

// Returns {rgba, width, height, header} ({elevations, ...} for bsq tiles),
// null if the tile does not exist, or {url, error} if it could not be fetched
async function fetchTile(url, source) {
  var resp, buf, decoded, err, controller, timer;
  var retries = source.retries >= 0 ? source.retries : RETRIES;
  if (typeof fetch != 'function') {
    stop('Fetching data requires a JavaScript runtime with fetch() (Node 18 or later)');
  }
  for (var attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await delay(RETRY_DELAY * Math.pow(2, attempt - 1));
    controller = typeof AbortController == 'function' ? new AbortController() : null;
    timer = controller ? setTimeout(function() { controller.abort(); }, TIMEOUT) : null;
    try {
      resp = await fetch(url, controller ? {signal: controller.signal} : undefined);
      // S3 answers 403 for missing keys; the Planetary Computer answers 204 for empty tiles
      if (resp.status == 404 || resp.status == 403 || resp.status == 204) return null;
      if (!resp.ok) throw new Error('HTTP status ' + resp.status);
      buf = await resp.arrayBuffer();
      decoded = source.encoding == 'bsq' ?
        decodeBsqTile(buf, source.tile_size, ELEVATION_NODATA) :
        await decodeTileImage(buf);
      decoded.header = source.sources_header && resp.headers && resp.headers.get ?
        resp.headers.get(source.sources_header) : null;
      return decoded;
    } catch(e) {
      err = controller && controller.signal.aborted ? new Error('no response after ' + TIMEOUT / 1000 + ' seconds') : e;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return {url: url, error: err && err.message || String(err)};
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

function delay(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
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
