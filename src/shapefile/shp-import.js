/* @requires
shp-common
shp-reader
dbf-reader
mapshaper-path-import
*/

// Read Shapefile data from a file, ArrayBuffer or Buffer
// @src filename or buffer
MapShaper.importShp = function(src, opts) {
  var reader = new ShpReader(src),
      shpType = reader.type(),
      type = MapShaper.translateShapefileType(shpType),
      importOpts = utils.defaults({
        type: type,
        reserved_points: Math.round(reader.header().byteLength / 16)
      }, opts),
      importer = new PathImporter(importOpts);

  if (!MapShaper.isSupportedShapefileType(shpType)) {
    stop("Unsupported Shapefile type:", shpType);
  }
  if (ShpType.isZType(shpType)) {
    message("Warning: Shapefile Z data will be lost.");
  } else if (ShpType.isMType(shpType)) {
    message("Warning: Shapefile M data will be lost.");
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
    }
  });

  return importer.done();
};
