import { parsePrj, setDatasetCrsInfo } from '../crs/mapshaper-projections';
import { runningInBrowser } from '../mapshaper-env';
import { getFileBase } from '../utils/mapshaper-filename-utils';
import { createRasterPreview, getRasterViewRecipe } from './mapshaper-raster-utils';
import { stop, warn } from '../utils/mapshaper-logging';
import require from '../mapshaper-require';

export async function importImageRaster(input, optsArg) {
  var opts = optsArg || {};
  var imageType = input.png ? 'png' : input.jpeg ? 'jpeg' : null;
  var imageInput = input[imageType];
  var decoded = await decodeImage(imageInput, imageType);
  var world = parseWorldFile(input.world && input.world.content);
  var sourceId = getFileBase(imageInput.filename || imageType);
  var transform, bbox, raster, dataset;
  if (!world) {
    stop('Image raster import requires a world file');
  }
  transform = getWorldTransform(world);
  bbox = getWorldFileBBox(transform, decoded.width, decoded.height);
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
      raster_sources: [getSourceInfo(imageInput, sourceId, imageType, input)]
    },
    layers: [{
      name: imageInput.filename ? getFileBase(imageInput.filename) : null,
      raster_type: 'grid',
      raster: raster
    }]
  };
  importImageCrs(dataset, input.prj);
  return dataset;
}

function getRasterInterpretation(opts) {
  return opts.raster_type || opts.rasterType || 'image';
}

async function decodeImage(input, imageType) {
  if (runningInBrowser()) {
    return decodeImageInBrowser(input.content, imageType);
  }
  return imageType == 'png' ? decodePng(input.content) : decodeJpeg(input.content);
}

function decodePng(content) {
  var png = require('pngjs').PNG.sync.read(Buffer.from(content));
  return rgbaToImageData(png.data, png.width, png.height, true);
}

function decodeJpeg(content) {
  var jpeg = require('jpeg-js');
  var image = jpeg.decode(Buffer.from(content), {useTArray: true});
  return rgbaToImageData(image.data, image.width, image.height, false);
}

async function decodeImageInBrowser(content, imageType) {
  var blob = new Blob([content], {type: imageType == 'png' ? 'image/png' : 'image/jpeg'});
  var bitmap = await createImageBitmap(blob);
  var canvas = document.createElement('canvas');
  var ctx, data;
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  if (bitmap.close) bitmap.close();
  return rgbaToImageData(data, canvas.width, canvas.height, imageType == 'png');
}

function rgbaToImageData(rgba, width, height, keepAlpha) {
  var bands = keepAlpha ? 4 : 3;
  var samples = new Uint8Array(width * height * bands);
  var src, dest;
  for (var i = 0, n = width * height; i < n; i++) {
    src = i * 4;
    dest = i * bands;
    samples[dest] = rgba[src];
    samples[dest + 1] = rgba[src + 1];
    samples[dest + 2] = rgba[src + 2];
    if (keepAlpha) samples[dest + 3] = rgba[src + 3];
  }
  return {
    width: width,
    height: height,
    bands: bands,
    samples: samples,
    sampleBands: bands == 4 ? [0, 1, 2, 3] : [0, 1, 2]
  };
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

function importImageCrs(dataset, prj) {
  var wkt = prj && prj.content;
  if (!wkt) {
    warn('Image raster is missing a .prj file; CRS is unknown');
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

function getSourceInfo(input, sourceId, imageType, group) {
  var content = input && input.content;
  return {
    id: sourceId,
    type: imageType,
    filename: input && input.filename || null,
    byteLength: content && content.byteLength || null,
    storage: runningInBrowser() ? 'indexeddb-pending' : 'path',
    worldFile: group.world && group.world.filename || null,
    prjFile: group.prj && group.prj.filename || null
  };
}
