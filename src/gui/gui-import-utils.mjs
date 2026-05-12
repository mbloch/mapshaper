import { showPopupAlert, showPrompt } from './gui-alert';
import { internal } from './gui-core';
import { loadScript } from './dom-utils';

export async function considerReprojecting(gui, dataset, opts) {
  var mapCRS = gui.map.getActiveLayerCRS();
  var dataCRS = internal.getDatasetCRS(dataset);
  if (!dataCRS || !mapCRS || internal.crsAreEqual(mapCRS, dataCRS)) return;
  if (datasetHasRaster(dataset)) {
    await showRasterProjectionMessage(dataset);
    return;
  }
  var msg = `The input file ${dataset?.info?.input_files[0] || ''} has a different projection from the current selected layer. Would you like to reproject it to match?`;
  var reproject = await showPrompt(msg, 'Reproject file?');
  if (reproject) {
    internal.projectDataset(dataset, dataCRS, mapCRS, {densify: true});
  }
}

async function showRasterProjectionMessage(rasterDataset) {
  var msg = `The raster file ${rasterDataset?.info?.input_files[0] || ''} has a different projection from the current selected layer. Raster reprojection is not supported yet. You can reproject vector layer(s) to match the raster.`;
  showPopupAlert(msg, 'Different projection').button('Close', function() {});
}

function datasetHasRaster(dataset) {
  return dataset.layers && dataset.layers.some(internal.layerHasRaster);
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

