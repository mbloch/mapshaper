import { layerHasRaster } from '../dataset/mapshaper-layer-type-utils';
import { importDatasetsFromFile } from '../io/mapshaper-file-import';
import { importDatasetsFromContent } from '../io/mapshaper-import';
import cli from '../cli/mapshaper-cli-utils';
import { runningInBrowser } from '../mapshaper-env';
import { getRasterGrid } from './mapshaper-raster-utils';
import { getRasterSourceReader, rasterSamplesAreFromSource } from './mapshaper-raster-source';
import { message, stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

// For commands that measure the band values of a raster source
// ({dataset, layer}) rather than display them. Returns a source whose raster
// has @bands (0-based indexes of the file's bands) at full resolution. A layer
// that was imported at reduced resolution, or without some of the bands (a
// layer has only the bands it displays), is replaced by a grid read again from
// its source file, provided that the layer hasn't been edited since it was
// imported. Bands that the file doesn't have are left for the caller to report.
export async function getRasterSourceBands(source, bands) {
  var lyr = source && source.layer;
  var raster = lyr && layerHasRaster(lyr) ? lyr.raster : null;
  var grid = raster ? getRasterGrid(raster) : null;
  var info, fileBands, missing, reduced, dataset, reread;
  if (!grid || !grid.samples) return source;
  info = findRasterSourceInfo(source.dataset, raster.sourceId);
  fileBands = info && info.bands > 0 ? info.bands : Infinity;
  missing = bands.filter(function(b) {
    return b < fileBands && !getGridSourceBands(grid).includes(b);
  });
  reduced = !!raster.reducedResolution;
  if (!reduced && missing.length === 0) return source;
  if (!rasterSamplesAreFromSource(grid)) {
    stop(getEditedRasterMessage(lyr, reduced, missing));
  }
  dataset = info ? await readRasterSource(info, source.dataset, bands) : null;
  reread = dataset && dataset.layers[0];
  if (!reread || !layerHasRaster(reread)) {
    stop(utils.format('Unable to read the source file of raster layer [%s]%s', lyr.name || '',
      info && info.filename ? ' (' + info.filename + ')' : ''));
  }
  requireMatchingSource(lyr, reread, info, dataset);
  message(utils.format('Reading %s of raster layer [%s] from its source file%s',
    formatBandList(bands), lyr.name || '', reduced ? ' at full resolution' : ''));
  reread.name = lyr.name;
  reread.raster.sourceId = raster.sourceId;
  return {
    dataset: Object.assign({}, source.dataset, {layers: [reread]}),
    layer: reread,
    disposable: true
  };
}

function getGridSourceBands(grid) {
  if (grid.sampleBands) return grid.sampleBands;
  return utils.range(grid.bands);
}

function findRasterSourceInfo(dataset, sourceId) {
  var sources = dataset && dataset.info && dataset.info.raster_sources || [];
  return sources.find(function(o) { return o.id == sourceId; }) || null;
}

// The CRS comes from the layer's dataset (the source is read only for its
// pixels), so import options are only needed for reading the pixels
async function readRasterSource(info, dataset, bands) {
  var importOpts = dataset && dataset.info && dataset.info.import_options || {};
  var opts = utils.defaults({resolution: 'full', source_bands: bands, no_topology: true}, importOpts);
  var reader = getRasterSourceReader();
  var group, datasets;
  if (reader) {
    group = await reader(info);
    datasets = group ? await importDatasetsFromContent(group, opts) : null;
  } else if (info.storage == 'path' && info.filename && cli.isFile(info.filename)) {
    datasets = await importDatasetsFromFile(info.filename, opts);
  }
  return datasets && datasets[0] || null;
}

// Guards against a file that was changed or replaced after it was imported
function requireMatchingSource(lyr, reread, info, dataset) {
  var a = getRasterGrid(lyr.raster);
  var b = getRasterGrid(reread.raster);
  var newInfo = dataset.info && dataset.info.raster_sources && dataset.info.raster_sources[0];
  var tolerance = Math.min((b.bbox[2] - b.bbox[0]) / b.width, (b.bbox[3] - b.bbox[1]) / b.height) / 2;
  var sameSize = !info.byteLength || !newInfo || !newInfo.byteLength || info.byteLength == newInfo.byteLength;
  var sameBounds = !!a.bbox && !!b.bbox && a.bbox.every(function(val, i) {
    return Math.abs(val - b.bbox[i]) <= tolerance;
  });
  if (!sameSize || !sameBounds) {
    stop(utils.format('The source file of raster layer [%s]%s has changed since it was imported',
      lyr.name || '', info.filename ? ' (' + info.filename + ')' : ''));
  }
}

function getEditedRasterMessage(lyr, reduced, missing) {
  var problem = reduced ? 'was imported at reduced resolution' :
    'was imported without ' + formatBandList(missing);
  var hint;
  if (reduced) {
    hint = 'To use it, import the raster with resolution=full.';
  } else if (runningInBrowser()) {
    hint = 'To use ' + (missing.length > 1 ? 'them' : 'it') + ', import the raster file again and use the new layer.';
  } else {
    hint = 'To use ' + (missing.length > 1 ? 'them' : 'it') + ', name the raster file in the command instead of the layer.';
  }
  return utils.format('Raster layer [%s] %s, and it has been edited since then, so its source file can\'t be read in its place. %s',
    lyr.name || '', problem, hint);
}

// e.g. "band2", "band2 and band5", "band1, band2 and band5"
function formatBandList(bands) {
  var names = bands.map(function(b) { return 'band' + (b + 1); });
  if (names.length < 2) return names.join('');
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}
