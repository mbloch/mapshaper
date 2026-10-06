import { parsePrj, setDatasetCrsInfo } from '../crs/mapshaper-projections';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import { probablyDecimalDegreeBounds } from '../geom/mapshaper-latlon';
import { runningInBrowser } from '../mapshaper-env';
import { getFileBase } from '../utils/mapshaper-filename-utils';
import { createRasterPreview, getRasterViewRecipe } from './mapshaper-raster-utils';
import { FULL_RESOLUTION_HINT, getRasterImportSize, parseImportResolution } from './mapshaper-raster-import-size';
import { message, stop, warn, warnOnce } from '../utils/mapshaper-logging';
import require from '../mapshaper-require';

export async function importImageRaster(input, optsArg) {
  var opts = optsArg || {};
  var imageType = input.png ? 'png' : input.jpeg ? 'jpeg' : null;
  var imageInput = input[imageType];
  var world = parseWorldFile(input.world && input.world.content);
  var sourceId = getFileBase(imageInput.filename || imageType);
  var decoded, transform, bbox, raster, dataset;
  if (!world) {
    stop('Image raster import requires a world file');
  }
  decoded = await decodeImage(imageInput, imageType, opts);
  if (decoded.width != decoded.sourceWidth || decoded.height != decoded.sourceHeight) {
    showResampledImageMessage(decoded, opts);
  }
  transform = getWorldTransform(world);
  bbox = getWorldFileBBox(transform, decoded.sourceWidth, decoded.sourceHeight);
  transform = scaleWorldTransform(transform,
    decoded.sourceWidth / decoded.width, decoded.sourceHeight / decoded.height);
  raster = {
    sourceId: sourceId,
    interpretation: getRasterInterpretation(opts),
    grid: {
      width: decoded.width,
      height: decoded.height,
      bands: decoded.bands,
      pixelType: 'uint8',
      samples: decoded.samples,
      sampleBands: decoded.sampleBands,
      nodata: null,
      bbox: bbox,
      transform: transform
    },
    derivation: {
      type: decoded.bands >= 3 ? 'rgb' : 'gray',
      sourceId: sourceId,
      bands: decoded.sampleBands
    },
    view: {
      recipe: {
        type: decoded.bands >= 3 ? 'rgb' : 'gray',
        bands: decoded.sampleBands
      }
    }
  };
  raster.view.recipe = getRasterViewRecipe(raster.grid, raster.view.recipe, opts);
  if (runningInBrowser()) {
    raster.view.preview = createRasterPreview(raster, opts);
  }
  dataset = {
    info: {
      raster_sources: [getSourceInfo(imageInput, sourceId, imageType, input, decoded)]
    },
    layers: [{
      name: imageInput.filename ? getFileBase(imageInput.filename) : null,
      raster_type: 'grid',
      raster: raster
    }]
  };
  importImageCrs(dataset, input.prj, imageInput.filename);
  return dataset;
}

function showResampledImageMessage(decoded, opts) {
  var msg = 'Using resampled image for import: ' + decoded.width + 'x' + decoded.height +
    ' (source: ' + decoded.sourceWidth + 'x' + decoded.sourceHeight + ').';
  if (parseImportResolution(opts.resolution)) {
    message(msg);
  } else {
    warnOnce(msg + ' ' + FULL_RESOLUTION_HINT);
  }
}

function getRasterInterpretation(opts) {
  return opts.interpretation || 'image';
}

async function decodeImage(input, imageType, opts) {
  if (runningInBrowser()) {
    return decodeImageInBrowser(input.content, imageType, opts);
  }
  return imageType == 'png' ? decodePng(input.content, opts) : decodeJpeg(input.content, opts);
}

function decodePng(content, opts) {
  var png = require('pngjs').PNG.sync.read(Buffer.from(content));
  return rgbaToImageData(png.data, png.width, png.height, true, opts);
}

function decodeJpeg(content, opts) {
  var jpeg = require('jpeg-js');
  // jpeg-js refuses images over 100 megapixels by default; a large image is
  // reduced to the import size after it is decoded
  var image = jpeg.decode(Buffer.from(content), {
    useTArray: true,
    maxResolutionInMP: Infinity,
    maxMemoryUsageInMB: Infinity
  });
  return rgbaToImageData(image.data, image.width, image.height, false, opts);
}

// The image is decoded at the size it is imported at, when its header gives
// the full size, so a large image never occupies a full-size canvas.
async function decodeImageInBrowser(content, imageType, opts) {
  var blob = new Blob([content], {type: imageType == 'png' ? 'image/png' : 'image/jpeg'});
  var sourceSize = readImageSize(content, imageType);
  var size = sourceSize ? getRasterImportSize(sourceSize.width, sourceSize.height, opts) : null;
  var bitmap, resized, canvas, ctx, data, imageData;
  if (size && (size.width != sourceSize.width || size.height != sourceSize.height)) {
    bitmap = await createImageBitmap(blob, getBitmapResizeOptions(size));
  } else {
    bitmap = await createImageBitmap(blob);
  }
  if (!sourceSize) {
    sourceSize = {width: bitmap.width, height: bitmap.height};
    size = getRasterImportSize(bitmap.width, bitmap.height, opts);
    if (size.width != bitmap.width || size.height != bitmap.height) {
      resized = await createImageBitmap(bitmap, getBitmapResizeOptions(size));
      if (bitmap.close) bitmap.close();
      bitmap = resized;
    }
  }
  canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  // scales the bitmap in a browser that ignores the resize options
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  data = ctx.getImageData(0, 0, size.width, size.height).data;
  if (bitmap.close) bitmap.close();
  imageData = rgbaToImageData(data, size.width, size.height, imageType == 'png');
  imageData.sourceWidth = sourceSize.width;
  imageData.sourceHeight = sourceSize.height;
  return imageData;
}

function getBitmapResizeOptions(size) {
  return {resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'high'};
}

// Reads the pixel dimensions from a PNG or JPEG header, or returns null
export function readImageSize(content, imageType) {
  var bytes = toUint8Array(content);
  if (!bytes) return null;
  return imageType == 'png' ? readPngSize(bytes) : readJpegSize(bytes);
}

function toUint8Array(content) {
  if (!content) return null;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (ArrayBuffer.isView(content)) {
    return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  }
  return null;
}

function readPngSize(bytes) {
  var width, height;
  if (bytes.length < 24 || bytes[0] != 0x89 || bytes[1] != 0x50 ||
      String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) != 'IHDR') {
    return null;
  }
  width = readUint32(bytes, 16);
  height = readUint32(bytes, 20);
  return width > 0 && height > 0 ? {width: width, height: height} : null;
}

function readUint32(bytes, i) {
  return ((bytes[i] << 24) >>> 0) + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3];
}

function readJpegSize(bytes) {
  var i = 2, marker, len, width, height;
  if (bytes[0] != 0xFF || bytes[1] != 0xD8) return null;
  while (i + 3 < bytes.length) {
    if (bytes[i] != 0xFF) return null;
    marker = bytes[i + 1];
    if (marker == 0xFF) { // fill byte
      i++;
      continue;
    }
    if (marker == 0x01 || marker >= 0xD0 && marker <= 0xD7) { // no length
      i += 2;
      continue;
    }
    if (marker == 0xD9 || marker == 0xDA) return null; // end of image, or scan data
    len = (bytes[i + 2] << 8) + bytes[i + 3];
    // SOF0 to SOF15, except DHT (C4), JPG (C8) and DAC (CC)
    if (marker >= 0xC0 && marker <= 0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC) {
      if (i + 8 >= bytes.length) return null;
      height = (bytes[i + 5] << 8) + bytes[i + 6];
      width = (bytes[i + 7] << 8) + bytes[i + 8];
      return width > 0 && height > 0 ? {width: width, height: height} : null;
    }
    i += 2 + len;
  }
  return null;
}

// @opts: import options, for reducing a large image to its import size
function rgbaToImageData(rgba, width, height, keepAlpha, opts) {
  var size = opts ? getRasterImportSize(width, height, opts) : {width: width, height: height};
  var bands = keepAlpha ? 4 : 3;
  var samples, src, dest;
  if (size.width != width || size.height != height) {
    samples = downsampleRgba(rgba, width, height, size.width, size.height, keepAlpha);
  } else {
    samples = new Uint8Array(width * height * bands);
    for (var i = 0, n = width * height; i < n; i++) {
      src = i * 4;
      dest = i * bands;
      samples[dest] = rgba[src];
      samples[dest + 1] = rgba[src + 1];
      samples[dest + 2] = rgba[src + 2];
      if (keepAlpha) samples[dest + 3] = rgba[src + 3];
    }
  }
  return {
    width: size.width,
    height: size.height,
    sourceWidth: width,
    sourceHeight: height,
    bands: bands,
    samples: samples,
    sampleBands: bands == 4 ? [0, 1, 2, 3] : [0, 1, 2]
  };
}

// Reduces an RGBA image by averaging the source pixels that fall in each
// output pixel, returning RGB or RGBA samples. Colors are weighted by alpha,
// so transparent pixels don't darken the edges of opaque areas.
export function downsampleRgba(rgba, srcW, srcH, dstW, dstH, keepAlpha) {
  var bands = keepAlpha ? 4 : 3;
  var out = new Uint8Array(dstW * dstH * bands);
  var colMap = new Int32Array(srcW);
  var colCount = new Uint32Array(dstW);
  var sums = new Float64Array(dstW * 4);
  var sy = 0, rows, i, j, k, n, a, x, tx, ty;
  for (x = 0; x < srcW; x++) {
    tx = Math.floor(x * dstW / srcW);
    colMap[x] = tx * 4;
    colCount[tx]++;
  }
  for (ty = 0; ty < dstH; ty++) {
    sums.fill(0);
    rows = 0;
    for (; sy < srcH && Math.floor(sy * dstH / srcH) == ty; sy++) {
      rows++;
      i = sy * srcW * 4;
      if (keepAlpha) {
        for (x = 0; x < srcW; x++, i += 4) {
          j = colMap[x];
          a = rgba[i + 3];
          sums[j] += rgba[i] * a;
          sums[j + 1] += rgba[i + 1] * a;
          sums[j + 2] += rgba[i + 2] * a;
          sums[j + 3] += a;
        }
      } else {
        for (x = 0; x < srcW; x++, i += 4) {
          j = colMap[x];
          sums[j] += rgba[i];
          sums[j + 1] += rgba[i + 1];
          sums[j + 2] += rgba[i + 2];
        }
      }
    }
    k = ty * dstW * bands;
    for (tx = 0; tx < dstW; tx++, k += bands) {
      j = tx * 4;
      n = colCount[tx] * rows;
      if (keepAlpha) {
        a = sums[j + 3];
        out[k] = a > 0 ? Math.round(sums[j] / a) : 0;
        out[k + 1] = a > 0 ? Math.round(sums[j + 1] / a) : 0;
        out[k + 2] = a > 0 ? Math.round(sums[j + 2] / a) : 0;
        out[k + 3] = Math.round(a / n);
      } else {
        out[k] = Math.round(sums[j] / n);
        out[k + 1] = Math.round(sums[j + 1] / n);
        out[k + 2] = Math.round(sums[j + 2] / n);
      }
    }
  }
  return out;
}

function parseWorldFile(content) {
  if (!content) return null;
  var vals = String(content).trim().split(/\s+/).map(Number);
  if (vals.length < 6 || vals.some(function(val) { return !isFinite(val); })) {
    stop('Invalid world file');
  }
  return vals.slice(0, 6);
}

function getWorldTransform(world) {
  var a = world[0], d = world[1], b = world[2], e = world[3],
      c = world[4], f = world[5];
  return [
    a,
    b,
    c - a / 2 - b / 2,
    d,
    e,
    f - d / 2 - e / 2
  ];
}

// @sx, @sy: source pixels per imported pixel, across and down
function scaleWorldTransform(t, sx, sy) {
  return [t[0] * sx, t[1] * sy, t[2], t[3] * sx, t[4] * sy, t[5]];
}

function getWorldFileBBox(transform, width, height) {
  var corners = [
    transformPoint(transform, 0, 0),
    transformPoint(transform, width, 0),
    transformPoint(transform, width, height),
    transformPoint(transform, 0, height)
  ];
  var xs = corners.map(function(p) { return p[0]; });
  var ys = corners.map(function(p) { return p[1]; });
  return [
    Math.min.apply(null, xs),
    Math.min.apply(null, ys),
    Math.max.apply(null, xs),
    Math.max.apply(null, ys)
  ];
}

function transformPoint(t, col, row) {
  return [
    t[0] * col + t[1] * row + t[2],
    t[3] * col + t[4] * row + t[5]
  ];
}

function importImageCrs(dataset, prj, filename) {
  var wkt = prj && prj.content;
  var name = filename || 'This image';
  if (!wkt) {
    // getDatasetCrsInfo() treats a dataset with lat-long range bounds as WGS 84
    if (probablyDecimalDegreeBounds(getDatasetBounds(dataset))) {
      message(name, 'has no .prj file. Its coordinates are in the',
        'decimal-degree range, so WGS 84 lat-long is assumed.');
    } else {
      warn(name, 'has no .prj file, so what its coordinates refer to is',
        'unknown, and projecting it or showing it over a basemap are',
        'unavailable. If you know the CRS, name it with -proj init=<crs> crs=<crs>');
    }
    return;
  }
  try {
    setDatasetCrsInfo(dataset, {
      wkt1: wkt,
      crs: parsePrj(wkt)
    });
  } catch(e) {
    dataset.info.wkt1 = wkt;
  }
}

function getSourceInfo(input, sourceId, imageType, group, decoded) {
  var content = input && input.content;
  return {
    id: sourceId,
    type: imageType,
    filename: input && input.filename || null,
    byteLength: content && content.byteLength || null,
    width: decoded.sourceWidth,
    height: decoded.sourceHeight,
    storage: runningInBrowser() ? 'indexeddb-pending' : 'path',
    worldFile: group.world && group.world.filename || null,
    prjFile: group.prj && group.prj.filename || null
  };
}
