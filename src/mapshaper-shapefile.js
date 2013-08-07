/* @requires mapshaper-common, mapshaper-geom, shp-reader, dbf-reader, mapshaper-path-import */

MapShaper.importDbf = function(src) {
  T.start();
  var data = new DbfReader(src).read("table");
  T.stop("[importDbf()]");
  return data;
};

// Read Shapefile data from an ArrayBuffer or Buffer
// Convert to format used for identifying topology
//
MapShaper.importShp = function(src) {
  T.start();

  var reader = new ShpReader(src);
  var supportedTypes = [
    ShpType.POLYGON, ShpType.POLYGONM, ShpType.POLYGONZ,
    ShpType.POLYLINE, ShpType.POLYLINEM, ShpType.POLYLINEZ
  ];
  if (!Utils.contains(supportedTypes, reader.type())) {
    stop("Only polygon and polyline Shapefiles are supported.");
  }
  if (reader.hasZ()) {
    trace("Warning: Z data is being removed.");
  } else if (reader.hasM()) {
    trace("Warning: M data is being removed.");
  }

  var counts = reader.getCounts();
  var importer = new PathImporter(counts.pointCount);
  var expectRings = Utils.contains([5,15,25], reader.type());

  // TODO: test cases: null shape; non-null shape with no valid parts

  reader.forEachShape(function(shp) {
    importer.startShape();
    if (shp.isNull) return;
    var partSizes = shp.readPartSizes(),
        coords = shp.readCoords(),
        offs = 0,
        pointsInPart;

    for (var j=0, n=shp.partCount; j<n; j++) {
      pointsInPart = partSizes[j];
      importer.importCoordsFromFlatArray(coords, offs, pointsInPart, expectRings);
      offs += pointsInPart * 2;
    }
  });

  var data = importer.done();
  T.stop("Import Shapefile");
  return data;
};

// Convert topological data to buffers containing .shp and .shx file data
//
MapShaper.exportShp = function(layers, arcData) {
  if (arcData instanceof ArcDataset === false || !Utils.isArray(layers)) error("Missing exportable data.");

  var files = [];
  Utils.forEach(layers, function(layer) {
    var obj = MapShaper.exportShpFile(layer, arcData);
    files.push({
        content: obj.shp,
        name: layer.name,
        extension: "shp"
      }, {
        content: obj.shx,
        name: layer.name,
        extension: "shx"
      });
  });
  return files;
};

MapShaper.exportShpFile = function(layer, arcData) {
  var geomType = layer.geometry_type;
  if (geomType != 'polyline' && geomType != 'polygon') error("Invalid geometry type:", geomType);

  var isPolygonType = geomType == 'polygon';
  var shpType = isPolygonType ? 5 : 3;

  T.start();
  T.start();

  var exporter = new PathExporter(arcData, isPolygonType);
  var fileBytes = 100;
  var bounds = new Bounds();
  var shapeBuffers = Utils.map(layer.shapes, function(shapeIds, i) {
    var shape = MapShaper.exportShpRecord(shapeIds, exporter, i+1, shpType);
    fileBytes += shape.buffer.byteLength;
    if (shape.bounds) bounds.mergeBounds(shape.bounds);
    return shape.buffer;
  });


  T.stop("export shape records");
  T.start();

  // write .shp header section
  var shpBin = new BinArray(fileBytes, false)
    .writeInt32(9994)
    .skipBytes(5 * 4)
    .writeInt32(fileBytes / 2)
    .littleEndian()
    .writeInt32(1000)
    .writeInt32(shpType)
    .writeFloat64(bounds.xmin)
    .writeFloat64(bounds.ymin)
    .writeFloat64(bounds.xmax)
    .writeFloat64(bounds.ymax)
    .skipBytes(4 * 8); // skip Z & M type bounding boxes;

  // write .shx header
  var shxBytes = 100 + shapeBuffers.length * 8;
  var shxBin = new BinArray(shxBytes, false)
    .writeBuffer(shpBin.buffer(), 100) // copy .shp header to .shx
    .position(24)
    .bigEndian()
    .writeInt32(shxBytes/2)
    .position(100);

  // write record sections of .shp and .shx
  Utils.forEach(shapeBuffers, function(buf, i) {
    var shpOff = shpBin.position() / 2,
        shpSize = (buf.byteLength - 8) / 2; // alternative: shxBin.writeBuffer(buf, 4, 4);
    shxBin.writeInt32(shpOff);
    shxBin.writeInt32(shpSize);
    shpBin.writeBuffer(buf);
  });

  var shxBuf = shxBin.buffer(),
      shpBuf = shpBin.buffer();

  T.stop("convert to binary");
  T.stop("Export Shapefile");
  return {shp: shpBuf, shx: shxBuf};
};


// Returns an ArrayBuffer containing a Shapefile record for one shape
//   and the bounding box of the shape.
// TODO: remove collapsed rings, convert to null shape if necessary
//
MapShaper.exportShpRecord = function(shapeIds, exporter, id, shpType) {
  var bounds = null,
      bin = null,
      data = exporter.exportShapeForShapefile(shapeIds);
  if (data.pointCount > 0) {
    var partsIdx = 52,
        pointsIdx = partsIdx + 4 * data.pathCount,
        recordBytes = pointsIdx + 16 * data.pointCount,
        pointCount = 0;

    bounds = data.bounds;
    bin = new BinArray(recordBytes, false)
      .writeInt32(id)
      .writeInt32((recordBytes - 8) / 2)
      .littleEndian()
      .writeInt32(shpType)
      .writeFloat64(bounds.xmin)
      .writeFloat64(bounds.ymin)
      .writeFloat64(bounds.xmax)
      .writeFloat64(bounds.ymax)
      .writeInt32(data.pathCount)
      .writeInt32(data.pointCount);

    Utils.forEach(data.paths, function(part, i) {
      bin.position(partsIdx + i * 4)
        .writeInt32(pointCount)
        .position(pointsIdx + pointCount * 16);
      var xx = part[0],
          yy = part[1];
      for (var j=0, len=xx.length; j<len; j++) {
        bin.writeFloat64(xx[j]);
        bin.writeFloat64(yy[j]);
      }
      pointCount += j;
    });
    if (data.pointCount != pointCount)
      error("Shp record point count mismatch; pointCount:",
          pointCount, "data.pointCount:", data.pointCount);

  }

  if (!bin) {
    bin = new BinArray(12, false)
      .writeInt32(id)
      .writeInt32(2)
      .littleEndian()
      .writeInt32(0);
  }

  return {bounds: bounds, buffer: bin.buffer()};
};
