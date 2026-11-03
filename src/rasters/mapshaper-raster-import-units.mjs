import { parseMeasure } from '../geom/mapshaper-units';
import { stop } from '../utils/mapshaper-logging';
import { parseVerticalUnits, verticalUnitsAreKnown } from './mapshaper-vertical-units';

var TO_METERS = {meters: 1, kilometers: 1000, feet: 0.3048, miles: 1609.344};

// Applies the -i options that state what a raster's metadata leaves out:
// vertical-units= (the units of its values) and pixel-size= (the ground size
// of a pixel, for a raster with no CRS)
export function applyRasterUnitOptions(dataset, opts) {
  var units = opts.vertical_units ? parseVerticalUnits(opts.vertical_units) : null;
  var pixelMeters = opts.pixel_size ? parsePixelSize(opts.pixel_size) : null;
  if (units && !verticalUnitsAreKnown(units)) {
    stop('Unsupported vertical-units=', opts.vertical_units + '. Use m, ft, us-ft, cm, mm or km');
  }
  if (pixelMeters && datasetHasCrs(dataset)) {
    stop('pixel-size= is for rasters without a coordinate system; the pixel size of this raster comes from its CRS');
  }
  dataset.layers.forEach(function(lyr, i) {
    var grid = lyr.raster && lyr.raster.grid;
    var source = dataset.info.raster_sources && dataset.info.raster_sources[i];
    if (!grid) return;
    if (units) grid.verticalUnits = units;
    if (pixelMeters) {
      // The size is given for the file's own pixels, which may be smaller than
      // the imported ones.
      grid.horizontalUnitMeters = pixelMeters /
        ((grid.bbox[2] - grid.bbox[0]) / (source && source.width || grid.width));
    }
  });
}

// Returns meters; a size without units is in meters
function parsePixelSize(str) {
  var o = parseMeasure(String(str));
  if (o.areal || !(o.value > 0)) {
    stop('Invalid pixel-size=', str + '. Expected a distance, e.g. 30m or 100ft');
  }
  return o.value * (o.units ? TO_METERS[o.units] : 1);
}

function datasetHasCrs(dataset) {
  var info = dataset.info || {};
  return !!(info.crs || info.crs_string || info.wkt1);
}
