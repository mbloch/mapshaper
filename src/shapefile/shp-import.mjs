import { isSupportedShapefileType } from '../shapefile/shp-common';
import { translateShapefileType } from '../shapefile/shp-common';
import { stop, message, verbose } from '../utils/mapshaper-logging';
import ShpType from '../shapefile/shp-type';
import { ShpReader } from '../shapefile/shp-reader';
import { PathImporter } from '../paths/mapshaper-path-import';
import utils from '../utils/mapshaper-utils';

// Read Shapefile data from a file, ArrayBuffer or Buffer
// @shp, @shx: filename or buffer
export function importShp(shp, shx, opts) {
  var reader = new ShpReader(shp, shx),
      shpType = reader.type(),
      type = translateShapefileType(shpType),
      importOpts = utils.defaults({
        type: type,
        reserved_points: Math.round(reader.header().byteLength / 16)
      }, opts),
      importer = new PathImporter(importOpts);

  if (!isSupportedShapefileType(shpType)) {
    stop("Unsupported Shapefile type:", shpType);
  }
  if (ShpType.isZType(shpType)) {
    verbose("Warning: Shapefile Z data will be lost.");
  } else if (ShpType.isMType(shpType)) {
    verbose("Warning: Shapefile M data will be lost.");
  }

  // TODO: test cases: null shape; non-null shape with no valid parts
  reader.forEachShape(function(shp) {
    importer.startShape();
    if (shp.isNull) {
      // skip
    } else if (type == 'point') {
      importer.importPoints(shp.readPoints());
    } else {
      shp.stream(importer);
      // shp.stream2(importer);
    }
  });

  return importer.done();
}
