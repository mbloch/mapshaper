import { showPrompt } from './gui-alert';
import { internal } from './gui-core';
import { loadScript } from './dom-utils';

export async function considerReprojecting(gui, dataset, opts) {
  var mapCRS = gui.map.getActiveLayerCRS();
  var dataCRS = internal.getDatasetCRS(dataset);
  var msg, reproject;
  if (!dataCRS || !mapCRS || internal.crsAreEqual(mapCRS, dataCRS)) return;
  if (!datasetCanBeReprojected(dataset, dataCRS, mapCRS)) {
    notifyProjectionMismatch(gui, dataset);
    return;
  }
  msg = `The input file ${dataset?.info?.input_files[0] || ''} has a different projection from the current selected layer. Would you like to reproject it to match?`;
  reproject = await showPrompt(msg, 'Reproject file?');
  if (reproject) {
    internal.projectDataset(dataset, dataCRS, mapCRS, {densify: true});
  }
}

function datasetCanBeReprojected(dataset, srcCRS, destCRS) {
  var bounds = internal.getDatasetBounds(dataset);
  var transform, p;
  if (!bounds || !bounds.hasBounds()) return false;
  transform = internal.getProjTransform2(srcCRS, destCRS);
  p = transform(bounds.centerX(), bounds.centerY());
  return !!(p && isFinite(p[0]) && isFinite(p[1]));
}

function notifyProjectionMismatch(gui, dataset) {
  if (!gui.notify) return;
  gui.notify({
    severity: 'warn',
    body: `The input file ${dataset?.info?.input_files[0] || ''} has a different projection from the current selected layer, but Mapshaper cannot transform it to the current projection.`,
    dedupKey: 'projection-mismatch:' + (dataset?.info?.input_files?.[0] || '')
  });
}


var geopackagePromise = null;
var geoParquetPromise = null;
var geoTIFFPromise = null;

export async function loadGeopackageLib() {
  if (!window.modules || !window.modules['@ngageoint/geopackage']) {
    if (!geopackagePromise) {
      geopackagePromise = loadScript('geopackage.js');
    }
    await geopackagePromise;
    geopackagePromise = null;
  }
}

export async function getGeoPackageFeatureTables(content) {
  var geopackage, gpkg, source;
  await loadGeopackageLib();
  geopackage = window.modules && window.modules['@ngageoint/geopackage'];
  if (!geopackage || !geopackage.GeoPackageAPI) {
    throw Error('GeoPackage library is not loaded');
  }
  if (content instanceof Uint8Array) {
    source = content;
  } else if (content instanceof ArrayBuffer) {
    source = new Uint8Array(content);
  } else {
    source = content;
  }
  gpkg = await geopackage.GeoPackageAPI.open(source);
  try {
    return gpkg.getFeatureTables() || [];
  } finally {
    gpkg.close();
  }
}

export async function loadGeoParquetLib() {
  if (!window.modules || !window.modules.hyparquet || !window.modules['hyparquet-compressors'] || !window.modules['hyparquet-writer'] || !window.modules['@bokuweb/zstd-wasm']) {
    if (!geoParquetPromise) {
      geoParquetPromise = loadScript('geoparquet.js');
    }
    await geoParquetPromise;
    geoParquetPromise = null;
  }
}

export async function loadGeoTIFFLib() {
  if (!window.modules || !window.modules.geotiff) {
    if (!geoTIFFPromise) {
      geoTIFFPromise = loadScript('geotiff.js');
    }
    await geoTIFFPromise;
    geoTIFFPromise = null;
  }
}

