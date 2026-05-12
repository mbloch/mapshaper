import { getCrsInfo, initProjLibrary, setDatasetCrsInfo } from '../crs/mapshaper-projections';
import { runningInBrowser } from '../mapshaper-env';
import { getFileBase } from '../utils/mapshaper-filename-utils';
import require from '../mapshaper-require';
import { message, stop, warnOnce } from '../utils/mapshaper-logging';
import { createRasterPreview, getRasterViewRecipe } from '../rasters/mapshaper-raster-utils';

var geotiffPromise = null;
var dynamicImportModule = Function('id', 'return import(id)');
var DEFAULT_MAX_IMPORT_PIXELS = 16e6;

export async function importGeoTIFF(input, optsArg) {
  var opts = optsArg || {};
  var geotiff = await loadGeoTIFFLib();
  var source = getGeoTIFFSource(input);
  var tiff = await openGeoTIFF(source, geotiff);
  var sourceImage = await tiff.getImage();
  var importImage = await selectGeoTIFFImportImage(tiff, sourceImage, opts);
  var imported = await importGeoTIFFImage(importImage, input, opts, sourceImage);
  var dataset = {
    info: {
      raster_sources: [imported.source]
    },
    layers: [{
      name: input && input.filename ? getFileBase(input.filename) : null,
      raster_type: 'grid',
      raster: imported.raster
    }]
  };
  await importGeoTIFFCrs(dataset, sourceImage);
  return dataset;
}

async function loadGeoTIFFLib() {
  var mod;
  if (runningInBrowser()) {
    mod = require('geotiff');
    if (!mod || !mod.fromArrayBuffer) {
      stop('GeoTIFF library is not loaded');
    }
    return mod;
  }
  if (!geotiffPromise) {
    geotiffPromise = dynamicImportModule('geotiff');
  }
  mod = await geotiffPromise;
  return mod.default && !mod.fromArrayBuffer ? mod.default : mod;
}

async function openGeoTIFF(source, geotiff) {
  if (!source) {
    stop('Missing GeoTIFF source data');
  }
  return geotiff.fromArrayBuffer(source);
}

function getGeoTIFFSource(input) {
  var content = input && input.content;
  if (!content) return null;
  if (content instanceof ArrayBuffer) return content;
  return content.buffer.slice(content.byteOffset || 0, (content.byteOffset || 0) + content.byteLength);
}

async function importGeoTIFFImage(importImage, input, opts, sourceImage) {
  var image = importImage.image;
  var width = importImage.width;
  var height = importImage.height;
  var samplesPerPixel = image.getSamplesPerPixel();
  var samples = getDisplaySamples(samplesPerPixel);
  var imageBbox = getImageBoundingBox(sourceImage);
  repairDeferredOffsetArrays(image);
  var data = await readGeoTIFFSamples(image, samples, width, height);
  var noData = getNoDataValue(image);
  var sourceId = getSourceId(input);
  var raster = {
    sourceId: sourceId,
    grid: {
      width: width,
      height: height,
      bands: samples.length,
      pixelType: getPixelType(image),
      samples: data,
      sampleBands: samples,
      nodata: noData,
      bbox: imageBbox,
      transform: getImageTransformForSize(sourceImage, width, height, imageBbox)
    },
    derivation: {
      type: samples.length >= 3 ? 'rgb' : 'gray',
      sourceId: sourceId,
      bands: samples
    },
    view: {
      recipe: {
        type: samples.length >= 3 ? 'rgb' : 'gray',
        bands: samples
      }
    }
  };
  raster.view.recipe = getRasterViewRecipe(raster.grid, raster.view.recipe, opts);
  raster.view.preview = createRasterPreview(raster, opts);
  return {
    raster: raster,
    source: getSourceInfo(input, sourceId, sourceImage)
  };
}

async function selectGeoTIFFImportImage(tiff, sourceImage, opts) {
  var maxPixels = getMaxImportPixels(opts);
  var renditions = await getGeoTIFFRenditions(tiff, sourceImage);
  var source = renditions[0];
  var best = getRequestedRendition(renditions, opts.rendition);
  var bestPixels;
  if (!best) {
    best = source;
    bestPixels = best.width * best.height;
    if (bestPixels > maxPixels) {
      best = getAutomaticRendition(renditions, maxPixels);
      bestPixels = best.width * best.height;
      if (bestPixels > maxPixels) {
        best = getResizedImportImage(best, maxPixels);
      }
    }
  }
  if (renditions.length > 1 && (runningInBrowser() || opts.rendition)) {
    message(getRenditionsMessage(renditions, best));
  }
  if (best.slug != 'full' || best.width != source.width || best.height != source.height) {
    warnOnce(getImportRenditionMessage(best, source));
  }
  return best;
}

async function getGeoTIFFRenditions(tiff, sourceImage) {
  var imageCount = await tiff.getImageCount();
  var renditions = [getRenditionInfo(sourceImage, 0)];
  var image;
  for (var i = 1; i < imageCount; i++) {
    image = await tiff.getImage(i);
    renditions.push(getRenditionInfo(image, i));
  }
  return renditions;
}

function getRenditionInfo(image, index) {
  return {
    image: image,
    index: index,
    slug: index === 0 ? 'full' : 'overview-' + index,
    width: image.getWidth(),
    height: image.getHeight()
  };
}

function getRequestedRendition(renditions, slug) {
  var match;
  if (!slug) return null;
  slug = String(slug);
  match = renditions.find(function(rendition) {
    return rendition.slug == slug || rendition.width + 'x' + rendition.height == slug;
  });
  if (!match) {
    stop('Unknown GeoTIFF rendition:', slug + '.', 'Use one of:', renditions.map(function(rendition) {
      return rendition.slug;
    }).join(','));
  }
  return match;
}

function getAutomaticRendition(renditions, maxPixels) {
  var best = renditions[0];
  var bestPixels = best.width * best.height;
  var rendition, pixels;
  for (var i = 1; i < renditions.length; i++) {
    rendition = renditions[i];
    pixels = rendition.width * rendition.height;
    if (pixels <= maxPixels && (bestPixels > maxPixels || pixels > bestPixels)) {
      best = rendition;
      bestPixels = pixels;
    } else if (bestPixels > maxPixels && pixels < bestPixels) {
      best = rendition;
      bestPixels = pixels;
    }
  }
  return best;
}

function getRenditionsMessage(renditions, selected) {
  var lines = ['GeoTIFF renditions:'];
  renditions.forEach(function(rendition) {
    lines.push('  ' + rendition.slug + ': ' + rendition.width + 'x' + rendition.height +
      (rendition.slug == selected.slug ? ' [selected]' : ''));
  });
  lines.push('Use import option rendition=<slug> to select a different rendition.');
  return lines.join('\n');
}

function getImportRenditionMessage(importImage, source) {
  if (importImage.resampled) {
    return 'Using resampled GeoTIFF ' + (importImage.sourceSlug == 'full' ? 'full-resolution image' : 'rendition ' + importImage.sourceSlug) +
      ' for import: ' + importImage.width + 'x' + importImage.height +
      ' (source: ' + source.width + 'x' + source.height + ').';
  }
  return 'Using reduced-resolution GeoTIFF rendition for import: ' + importImage.slug + ' ' +
    importImage.width + 'x' + importImage.height + ' (source: ' + source.width + 'x' + source.height + ').';
}

function getResizedImportImage(importImage, maxPixels) {
  var scale = Math.min(1, Math.sqrt(maxPixels / (importImage.width * importImage.height)));
  return Object.assign({}, importImage, {
    sourceSlug: importImage.slug,
    slug: importImage.slug + '-resampled',
    resampled: true,
    width: Math.max(1, Math.round(importImage.width * scale)),
    height: Math.max(1, Math.round(importImage.height * scale))
  });
}

function getMaxImportPixels(opts) {
  return opts.maxPixels || opts.raster_max_pixels || opts.rasterMaxPixels ||
    DEFAULT_MAX_IMPORT_PIXELS;
}

async function readGeoTIFFSamples(image, samples, width, height) {
  var opts = {
    interleave: true,
    width: width,
    height: height
  };
  if (useRGBRead(image, samples)) {
    return image.readRGB(opts);
  }
  opts.samples = samples;
  return image.readRasters(opts);
}

function useRGBRead(image, samples) {
  return samples.length == 3 && getPhotometricInterpretation(image) == 6 && image.readRGB;
}

function getDisplaySamples(samplesPerPixel) {
  if (samplesPerPixel >= 4) return [0, 1, 2, 3];
  if (samplesPerPixel >= 3) return [0, 1, 2];
  return [0];
}

function getNoDataValue(image) {
  var val = image.getGDALNoData && image.getGDALNoData();
  return val == null || val === '' ? null : +val;
}

function getPixelType(image) {
  var fmt = image.getSampleFormat && image.getSampleFormat();
  var bits = image.getBitsPerSample && image.getBitsPerSample();
  if (Array.isArray(fmt)) fmt = fmt[0];
  if (Array.isArray(bits)) bits = bits[0];
  var type = fmt == 3 ? 'float' : fmt == 2 ? 'int' : 'uint';
  return bits ? type + bits : type;
}

function getImageBoundingBox(image) {
  try {
    return image.getBoundingBox().map(Number);
  } catch(e) {
    stop('GeoTIFF is missing georeferencing metadata');
  }
}

function getImageTransformForSize(image, width, height, bbox) {
  var sourceBbox = bbox || getImageBoundingBox(image);
  return [
    (sourceBbox[2] - sourceBbox[0]) / width,
    0,
    sourceBbox[0],
    0,
    (sourceBbox[1] - sourceBbox[3]) / height,
    sourceBbox[3]
  ];
}

function getImageTransform(image) {
  var origin = image.getOrigin && image.getOrigin();
  var resolution = image.getResolution && image.getResolution();
  if (!origin || !resolution) return null;
  return [resolution[0], 0, origin[0], 0, resolution[1], origin[1]];
}

function getPhotometricInterpretation(image) {
  var fileDirectory = image && image.fileDirectory;
  return fileDirectory && fileDirectory.actualizedFields && fileDirectory.actualizedFields.get(262);
}

function repairDeferredOffsetArrays(image) {
  var fileDirectory = image && image.fileDirectory;
  var arrays = fileDirectory && fileDirectory.deferredArrays;
  if (!arrays || !fileDirectory.actualizedFields) return;
  // Work around geotiff.js decoding big-endian deferred offset/count arrays as little-endian.
  [273, 279, 324, 325].forEach(function(tag) {
    var deferred = arrays.get(tag);
    var values;
    if (!deferred || deferred.littleEndian) return;
    values = decodeDeferredIntegerArray(deferred);
    if (!values) return;
    fileDirectory.actualizedFields.set(tag, values);
    arrays.delete(tag);
  });
}

function decodeDeferredIntegerArray(deferred) {
  var source = deferred.source && deferred.source.arrayBuffer;
  var offset = deferred.arrayOffset;
  var length = deferred.length;
  var itemSize = deferred.itemSize;
  var view, values;
  if (!source || !length || !itemSize) return null;
  view = new DataView(source, offset, length * itemSize);
  if (itemSize == 2) {
    values = new Uint16Array(length);
    for (var i = 0; i < length; i++) values[i] = view.getUint16(i * itemSize, false);
    return values;
  }
  if (itemSize == 4) {
    values = new Uint32Array(length);
    for (var j = 0; j < length; j++) values[j] = view.getUint32(j * itemSize, false);
    return values;
  }
  if (itemSize == 8 && typeof view.getBigUint64 == 'function') {
    values = [];
    for (var k = 0; k < length; k++) values[k] = Number(view.getBigUint64(k * itemSize, false));
    return values;
  }
  return null;
}

function getSourceId(input) {
  return input && input.filename ? getFileBase(input.filename) : 'geotiff-source';
}

function getSourceInfo(input, sourceId, image) {
  var content = input && input.content;
  return {
    id: sourceId,
    filename: input && input.filename || null,
    byteLength: content && content.byteLength || null,
    storage: runningInBrowser() ? 'indexeddb-pending' : 'path',
    width: image.getWidth(),
    height: image.getHeight(),
    bands: image.getSamplesPerPixel(),
    pixelType: getPixelType(image),
    bbox: getImageBoundingBox(image),
    transform: getImageTransform(image)
  };
}

async function importGeoTIFFCrs(dataset, image) {
  var crsString = getGeoTIFFCrsString(image);
  if (!crsString) {
    warnOnce('Unable to import CRS from GeoTIFF metadata');
    return;
  }
  await initProjLibrary({crs: crsString});
  try {
    setDatasetCrsInfo(dataset, getCrsInfo(crsString));
  } catch(e) {
    dataset.info = Object.assign(dataset.info || {}, {crs_string: crsString});
  }
}

function getGeoTIFFCrsString(image) {
  var keys = image.getGeoKeys && image.getGeoKeys() || {};
  var code = keys.ProjectedCSTypeGeoKey || keys.GeographicTypeGeoKey;
  return code ? 'EPSG:' + code : null;
}
