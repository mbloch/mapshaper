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
      maxPoints = Math.round(reader.header().byteLength / 16), // for reserving buffer space
      importer = new PathImporter(opts, maxPoints);

  if (!type) {
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
    if (shp.isNull) return;
    if (type == 'point') {
      importer.importPoints(shp.readPoints());
    } else {
      var xy = shp.readXY(),
          parts = shp.readPartSizes(),
          start = 0,
          len;

      for (var i=0; i<parts.length; i++) {
        len = parts[i] * 2;
        importer.importPathFromFlatArray(xy, type, len, start);
        start += len;
      }
    }
  });

  return importer.done();
};
