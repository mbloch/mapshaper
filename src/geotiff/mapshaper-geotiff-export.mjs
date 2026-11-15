import {
  crsToPrj,
  crsToWkt2,
  getDatasetCrsInfo,
  isLatLngCRS,
  isWGS84,
  isWebMercator,
  parseAuthorityCodeFromWkt,
  parseAuthorityCodeString
} from '../crs/mapshaper-projections';
import { layerHasRaster } from '../dataset/mapshaper-layer-utils';
import { AUX_EXT, formatAuxXml, getAuxFilename } from '../geotiff/mapshaper-geotiff-aux';
import { encodeGeoTIFF } from '../geotiff/mapshaper-geotiff-encode';
import { getCrsGeoKeys } from '../geotiff/mapshaper-geotiff-geokeys';
import { getRasterGrid, rasterGridIsRotated } from '../rasters/mapshaper-raster-utils';
import { getGdalUnitType } from '../rasters/mapshaper-vertical-units';
import { getFileExtension } from '../utils/mapshaper-filename-utils';
import { message, stop } from '../utils/mapshaper-logging';

// GeoTIFF's model type: is the raster referenced to a projected or a
// geographic CRS?
var MODEL_TYPE_PROJECTED = 1;
var MODEL_TYPE_GEOGRAPHIC = 2;
// The raster covers areas, i.e. a coordinate refers to a pixel's corner rather
// than its center. This matches how mapshaper's grid bbox is defined.
var RASTER_TYPE_AREA = 1;

export function exportGeoTIFF(dataset, opts) {
  var extension = opts.extension ||
    (opts.file ? getFileExtension(opts.file) : '') || 'tif';
  var crs = getOutputCrs(dataset);
  var files = [];
  dataset.layers.forEach(function(lyr) {
    var filename = lyr.name + '.' + extension;
    files.push({
      filename: filename,
      content: encodeRasterLayer(lyr, crs, opts)
    });
    // A projection that GeoTIFF has no way to describe travels in a sidecar
    // file instead.
    if (crs.code || crs.geoKeys) return;
    if (crs.wkt) {
      files.push({
        filename: getAuxFilename(filename),
        content: formatAuxXml(crs.wkt)
      });
      message('Wrote the CRS of', filename, 'to a', AUX_EXT, 'file, because GeoTIFF has no way to describe this projection. Keep the two files together.');
    } else {
      message('Wrote', filename, 'without CRS metadata (mapshaper could not derive it for this dataset). Other software will read the coordinates without knowing what they refer to.');
    }
  });
  return files;
}

function encodeRasterLayer(lyr, crs, opts) {
  var grid = layerHasRaster(lyr) ? getRasterGrid(lyr.raster) : null;
  if (!grid || !grid.samples) {
    stop('GeoTIFF output requires a raster layer with pixel data');
  }
  if (!grid.bbox) {
    stop('Unable to export a raster layer without georeferencing');
  }
  if (!(grid.width > 0 && grid.height > 0) ||
      grid.samples.length < grid.width * grid.height * grid.bands) {
    stop('Unable to export a raster layer with incomplete pixel data');
  }
  if (rasterGridIsRotated(grid)) {
    // Georeferencing is written as a tiepoint plus a pixel scale, which cannot
    // express rotation or skew.
    stop('Exporting a rotated or skewed raster is not supported');
  }
  return encodeGeoTIFF(grid, {
    geoKeys: getGeoKeys(crs),
    compress: getCompressionSetting(opts),
    gdalMetadata: getGdalBandMetadata(grid)
  });
}

// GDAL (and QGIS) read a band's units from GDAL's metadata tag. The units
// describe the elevation band, which is the first band.
function getGdalBandMetadata(grid) {
  if (!grid.verticalUnits) return null;
  return [{band: 0, name: 'UNITTYPE', role: 'unittype', value: getGdalUnitType(grid.verticalUnits)}];
}

function getCompressionSetting(opts) {
  var arg = opts.compression;
  if (!arg || arg == 'deflate') return true;
  if (arg == 'none') return false;
  stop('Unsupported GeoTIFF compression:', arg);
}

function getGeoKeys(crs) {
  var keys = {GTRasterTypeGeoKey: RASTER_TYPE_AREA};
  if (crs.code) {
    // An EPSG code says everything, including which datum realization the
    // coordinates are in, so it is preferred to spelling the projection out.
    keys.GTModelTypeGeoKey = crs.isLatLng ? MODEL_TYPE_GEOGRAPHIC : MODEL_TYPE_PROJECTED;
    keys[crs.isLatLng ? 'GeographicTypeGeoKey' : 'ProjectedCSTypeGeoKey'] = crs.code;
    return keys;
  }
  // Otherwise the projection is written out parameter by parameter. Failing
  // that, the raster is georeferenced but says nothing about what its
  // coordinates refer to, and the CRS goes in a sidecar file.
  return Object.assign(keys, crs.geoKeys || {});
}

// Describe the dataset's CRS in the forms the writer can use: an EPSG code,
// a set of geo keys spelling the projection out, and a WKT string for the
// sidecar file. Returns {code, geoKeys, isLatLng, wkt}, any member of which may
// be missing.
function getOutputCrs(dataset) {
  var info = (dataset && dataset.info) || {};
  var crsInfo = tryGetCrsInfo(dataset);
  var crs = crsInfo && crsInfo.crs;
  var code = getEpsgCode(info, crs);
  return {
    code: code,
    geoKeys: code || !crs ? null : getCrsGeoKeys(crs),
    isLatLng: !!crs && isLatLngCRS(crs),
    wkt: getOutputWkt(info, crs)
  };
}

function tryGetCrsInfo(dataset) {
  try {
    // Besides reading the dataset's CRS metadata, this infers WGS-84 from
    // lat-long-looking bounds.
    return getDatasetCrsInfo(dataset);
  } catch(e) {
    return null;
  }
}

function getEpsgCode(info, crs) {
  var authority = parseAuthorityCodeString(info.crs_string) ||
    parseAuthorityCodeFromWkt(info.wkt1);
  if (authority && authority.org == 'EPSG') return authority.code;
  if (info.geopackage_crs &&
      String(info.geopackage_crs.organization || '').toUpperCase() == 'EPSG') {
    return info.geopackage_crs.organization_coordsys_id ||
      info.geopackage_crs.srs_id || null;
  }
  // The two CRSes that mapshaper can recognize from a projection definition
  // alone; they also cover its wgs84 and webmercator aliases, which arrive here
  // without a code.
  if (crs && isWGS84(crs)) return 4326;
  if (crs && isWebMercator(crs)) return 3857;
  return null;
}

function getOutputWkt(info, crs) {
  if (info.wkt1) return info.wkt1; // the CRS as the user supplied it
  if (!crs) return null;
  try {
    // WKT2 carries more of a projection's parameters than WKT1 does.
    return crsToWkt2(crs) || crsToPrj(crs) || null;
  } catch(e) {
    return null;
  }
}
