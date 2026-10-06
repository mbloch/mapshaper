import { initProjLibrary, setDatasetCrsInfo, tryParseCrsString, tryParseWktToProj } from '../crs/mapshaper-projections';
import { AUX_EXT, auxCrsIsWkt, parseAuxCrsString } from '../geotiff/mapshaper-geotiff-aux';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import { probablyDecimalDegreeBounds } from '../geom/mapshaper-latlon';
import { getGeoKeyProjection, replaceProj4Projection } from '../geotiff/mapshaper-geotiff-geokeys';
import { runningInBrowser } from '../mapshaper-env';
import { getFileBase } from '../utils/mapshaper-filename-utils';
import require from '../mapshaper-require';
import { message, stop, warnOnce } from '../utils/mapshaper-logging';
import { createRasterPreview, getRasterViewRecipe } from '../rasters/mapshaper-raster-utils';
import { FULL_RESOLUTION_HINT, getMaxImportPixels, getRasterImportSize, parseImportResolution } from '../rasters/mapshaper-raster-import-size';

var geotiffPromise = null;
var geoKeysToProj4Promise = null;
var dynamicImportModule = Function('id', 'return import(id)');

// aux: contents of the file's .aux.xml sidecar, if it has one
export async function importGeoTIFF(input, optsArg, aux) {
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
  await importGeoTIFFCrs(dataset, sourceImage, aux);
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

async function loadGeoKeysToProj4Lib() {
  var mod;
  if (runningInBrowser()) {
    return require('geotiff-geokeys-to-proj4');
  }
  if (!geoKeysToProj4Promise) {
    geoKeysToProj4Promise = dynamicImportModule('geotiff-geokeys-to-proj4');
  }
  mod = await geoKeysToProj4Promise;
  return mod.default || mod;
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
    interpretation: getRasterInterpretation(opts),
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
  if (runningInBrowser()) {
    raster.view.preview = createRasterPreview(raster, opts);
  }
  return {
    raster: raster,
    source: getSourceInfo(input, sourceId, sourceImage)
  };
}

function getRasterInterpretation(opts) {
  return opts.interpretation || 'image';
}

async function selectGeoTIFFImportImage(tiff, sourceImage, opts) {
  var maxPixels = getMaxImportPixels(opts);
  var resolution = parseImportResolution(opts.resolution);
  var renditions = await getGeoTIFFRenditions(tiff, sourceImage);
  var source = renditions[0];
  var best = getRequestedRendition(renditions, opts.rendition);
  var bestPixels;
  if (resolution && resolution.full) {
    best = best || source;
  } else if (resolution) {
    best = best || getRenditionForWidth(renditions, resolution.width);
    if (best.width > resolution.width) {
      best = getResizedImportImage(best, getRasterImportSize(best.width, best.height, opts));
    }
  } else if (!best) {
    best = source;
    bestPixels = best.width * best.height;
    if (bestPixels > maxPixels) {
      best = getAutomaticRendition(renditions, maxPixels);
      bestPixels = best.width * best.height;
      if (bestPixels > maxPixels) {
        best = getResizedImportImage(best, getRasterImportSize(best.width, best.height, opts));
      }
    }
  }
  if (renditions.length > 1 && (runningInBrowser() || opts.rendition)) {
    message(getRenditionsMessage(renditions, best));
  }
  if (best.slug != 'full' || best.width != source.width || best.height != source.height) {
    if (resolution || opts.rendition) {
      message(getImportRenditionMessage(best, source));
    } else {
      warnOnce(getImportRenditionMessage(best, source) + ' ' + FULL_RESOLUTION_HINT);
    }
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

// The smallest rendition at least @width pixels wide, so that resampling to
// @width reads as little data as possible without enlarging anything
function getRenditionForWidth(renditions, width) {
  return renditions.reduce(function(memo, rendition) {
    if (rendition.width >= width && rendition.width < memo.width) return rendition;
    return memo;
  }, renditions[0]);
}

function getResizedImportImage(importImage, size) {
  return Object.assign({}, importImage, {
    sourceSlug: importImage.slug,
    slug: importImage.slug + '-resampled',
    resampled: true,
    width: size.width,
    height: size.height
  });
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

// Reads the CRS a GeoTIFF claims, if mapshaper can make sense of it. A file
// with no usable CRS metadata still imports: the raster keeps the coordinates
// in its own georeferencing, and only the things that need to know what those
// coordinates mean (reprojecting, basemaps, measuring) are unavailable. So a
// CRS that cannot be read is reported and set aside, never raised as an error.
//
// A projection GeoTIFF cannot describe travels beside the file in a .aux.xml
// sidecar, which is read when the file's own geo keys come up empty. The keys
// come first, matching how GDAL treats the two: the sidecar supplements a file
// that says nothing, rather than overruling one that does.
async function importGeoTIFFCrs(dataset, image, aux) {
  var crsInfo = await getGeoTIFFCrsInfo(image);
  var fromFile = await readCrsString(crsInfo.crsString);
  // The sidecar usually states its CRS in WKT, which has to become a proj4
  // definition before it can be used like the file's own metadata.
  var sidecarSrs = fromFile || !aux ? null : parseAuxCrsString(aux.content);
  var sidecarWkt = auxCrsIsWkt(sidecarSrs) ? sidecarSrs : null;
  var sidecarString = sidecarWkt ? tryParseWktToProj(sidecarWkt) : sidecarSrs;
  var fromSidecar = await readCrsString(sidecarString);
  var found = fromFile || fromSidecar;
  if (!found) {
    dataset.info = dataset.info || {};
    reportMissingCrs(dataset, crsInfo, sidecarString);
    return;
  }
  setDatasetCrsInfo(dataset, {crs_string: found.crsString, crs: found.crs});
  if (found.assumedDatum) {
    message('This GeoTIFF describes its projection without naming a datum;',
      'assuming WGS 84.');
  }
  if (fromSidecar) {
    message('Read the CRS from ' + (aux.filename || 'a ' + AUX_EXT + ' file') +
      ', because GeoTIFF has no way to describe this projection.');
    if (sidecarWkt) {
      // Keep the sidecar's own wording, so that exporting the raster again
      // writes back what was read rather than a re-derived approximation.
      dataset.info.wkt1 = sidecarWkt;
    }
  }
}

// Returns {crsString, crs}, or null if there is no string or it cannot be used.
async function readCrsString(str) {
  var crs, assumed;
  if (!str) return null;
  try {
    await initProjLibrary({crs: str});
  } catch(e) {
    // A projection resource that would not load leaves the string to be
    // parsed with whatever is already known.
  }
  crs = tryParseCrsString(str);
  if (crs) return {crsString: str, crs: crs};
  // A projection with no earth to sit on is tried again on a WGS-84 one, the
  // datum mapshaper assumes for any data that does not name one.
  assumed = addAssumedDatum(str);
  crs = assumed ? tryParseCrsString(assumed) : null;
  return crs ? {crsString: assumed, crs: crs, assumedDatum: true} : null;
}

// GeoTIFF metadata can describe a projection without saying what shape of earth
// it applies to: the geo keys carry a transformation and its parameters, and
// the datum keys are absent or name something the EPSG database does not have.
// Since the geokeys-to-proj4 library ends every definition with +no_defs, proj
// will not supply its usual default either, and the whole projection is lost
// over a missing ellipsoid. Returns the definition with a WGS-84 datum added,
// or null if it already has one (or is not a proj4 definition at all).
function addAssumedDatum(str) {
  if (!/\+proj=/.test(str) || /\+(datum|ellps|a|b|R|nadgrids|init)=/.test(str)) {
    return null;
  }
  return str + ' +datum=WGS84';
}

// What to say about a raster that arrives without a CRS. A file that simply has
// no CRS metadata is the ordinary case for an image, and is treated the way a
// vector file with no projection metadata is: coordinates in the decimal-degree
// range are taken for WGS-84 lat-long when something needs to know, which is
// worth saying but not worth warning about. Metadata that mapshaper could not
// make sense of is a different matter, and keeps the warning.
function reportMissingCrs(dataset, crsInfo, sidecarString) {
  if (crsInfo.absent && !sidecarString) {
    if (probablyDecimalDegreeBounds(getDatasetBounds(dataset))) {
      message('This GeoTIFF has no CRS metadata. Its coordinates are in the',
        'decimal-degree range, so WGS 84 lat-long is assumed.');
    } else {
      message('This GeoTIFF has no CRS metadata, so what its coordinates refer',
        'to is unknown, and projecting it or showing it over a basemap are',
        'unavailable. If you know the CRS, name it with -proj init=<crs>',
        'crs=<crs>');
    }
    return;
  }
  warnOnce(getGeoTIFFCrsWarning(crsInfo,
    getUnusableCrsDetail(crsInfo.crsString, sidecarString)));
}

function getUnusableCrsDetail(fileString, sidecarString) {
  var tried = [fileString, sidecarString].filter(Boolean);
  if (!tried.length) return null;
  return 'Unable to use projection ' + tried.join(' or ');
}

async function getGeoTIFFCrsInfo(image) {
  var keys = image.getGeoKeys && image.getGeoKeys() || {};
  var code = keys.ProjectedCSTypeGeoKey;
  var customProjection;
  if (!hasCrsGeoKeys(keys)) {
    // Asked about a file that says nothing, the geokeys-to-proj4 library
    // answers "+proj=longlat" rather than nothing, having taken the silence for
    // a geographic CRS. That is a guess about the coordinates, not something
    // read out of the file, and mapshaper makes it later and better, from the
    // coordinate range, in the same way it does for a vector file with no
    // projection metadata.
    return {crsString: null, absent: true};
  }
  if (isGeoTIFFAuthorityCode(code)) {
    return {crsString: 'EPSG:' + code};
  }
  customProjection = await getGeoTIFFCustomProjection(keys);
  if (customProjection.crsString) return customProjection;
  code = keys.GeographicTypeGeoKey;
  if (isGeoTIFFAuthorityCode(code)) return {crsString: 'EPSG:' + code};
  return {crsString: null, warning: customProjection.warning};
}

function getGeoTIFFCrsWarning(crsInfo, detail) {
  if (detail || crsInfo && crsInfo.warning) {
    logGeoTIFFCrsWarningDetails(detail, crsInfo && crsInfo.warning);
  }
  return 'The GeoTIFF does not contain usable CRS data';
}

// Keys that say something about the CRS itself, as opposed to how the pixels
// are laid out (GTRasterTypeGeoKey) or what the file calls things (the
// citation keys).
var CRS_GEO_KEYS = [
  'GTModelTypeGeoKey',
  'GeographicTypeGeoKey', 'GeogGeodeticDatumGeoKey', 'GeogEllipsoidGeoKey',
  'GeogPrimeMeridianGeoKey', 'GeogSemiMajorAxisGeoKey',
  'GeogSemiMinorAxisGeoKey', 'GeogInvFlatteningGeoKey',
  'ProjectedCSTypeGeoKey', 'ProjectionGeoKey', 'ProjCoordTransGeoKey'
];

function hasCrsGeoKeys(keys) {
  return CRS_GEO_KEYS.some(function(name) {
    return keys[name] !== undefined && keys[name] !== null;
  });
}

function isGeoTIFFAuthorityCode(code) {
  return code > 0 && code != 32767;
}

// Reads a projection that the file spells out in its geo keys, rather than
// naming by a code.
//
// The bulk of the work is done by the geokeys-to-proj4 library, which knows the
// EPSG database and so reads datums, ellipsoids and units thoroughly. Its
// reading of the projection parameters themselves is loose, though: it drops
// the central meridian of a polar stereographic projection, the azimuth of an
// oblique Mercator, and the true-scale parallel of a Mercator. So the
// projection part of its answer is replaced with mapshaper's own reading of the
// same keys, for the projections mapshaper knows how to write.
async function getGeoTIFFCustomProjection(keys) {
  var converted = await getGeoTIFFProj4FromGeoKeys(keys);
  var projection = getGeoKeyProjection(keys);
  if (!projection) return converted;
  if (converted.crsString) {
    return {crsString: replaceProj4Projection(converted.crsString, projection)};
  }
  return {
    crsString: getGeoTIFFEllipsoidProjection(keys, projection),
    warning: converted.warning
  };
}

// A last resort for a file whose datum the library could not read: the
// projection as mapshaper reads it, on an ellipsoid taken straight from the
// geo keys.
function getGeoTIFFEllipsoidProjection(keys, projection) {
  var units = getGeoTIFFLinearUnits(keys);
  var ellipsoid = getGeoTIFFEllipsoid(keys);
  if (!units || !ellipsoid) return null;
  return projection + ' ' + ellipsoid + ' ' + units;
}

async function getGeoTIFFProj4FromGeoKeys(keys) {
  var geokeysToProj4, result;
  try {
    geokeysToProj4 = await loadGeoKeysToProj4Lib();
    result = geokeysToProj4.toProj4(keys);
  } catch(e) {
    return {crsString: null, warning: {type: 'GeoKey converter error', error: e.message || e}};
  }
  if (result && result.proj4) {
    return {crsString: normalizeGeoTIFFProj4(result.proj4)};
  }
  return {crsString: null, warning: result && result.errors || null};
}

function normalizeGeoTIFFProj4(str) {
  return String(str).replace(/\s\+axis=[^ ]+/g, '').trim();
}

function logGeoTIFFCrsWarningDetails(parseError, converterDetails) {
  if (typeof console == 'undefined' || !console.warn) return;
  console.warn('Unable to import GeoTIFF CRS metadata', {
    parseError: parseError || null,
    converterDetails: converterDetails || null
  });
}

function getGeoTIFFLinearUnits(keys) {
  var code = keys.ProjLinearUnitsGeoKey;
  if (!code || code == 9001) return '+units=m';
  if (code == 9002) return '+units=ft';
  if (code == 9003) return '+to_meter=0.3048006096012192';
  return null;
}

function getGeoTIFFEllipsoid(keys) {
  if (keys.GeographicTypeGeoKey == 4326) return '+datum=WGS84';
  if (isFinite(keys.GeogSemiMajorAxisGeoKey) && isFinite(keys.GeogInvFlatteningGeoKey)) {
    return '+a=' + keys.GeogSemiMajorAxisGeoKey + ' +rf=' + keys.GeogInvFlatteningGeoKey;
  }
  if (isFinite(keys.GeogSemiMajorAxisGeoKey) && isFinite(keys.GeogSemiMinorAxisGeoKey)) {
    return '+a=' + keys.GeogSemiMajorAxisGeoKey + ' +b=' + keys.GeogSemiMinorAxisGeoKey;
  }
  return null;
}
