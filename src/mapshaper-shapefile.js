/* @requires mapshaper-common, mapshaper-geom, shp-reader, dbf-reader, mapshaper-path-import */

MapShaper.translateShapefileType = function(shpType) {
  if (Utils.contains([ShpType.POLYGON, ShpType.POLYGONM, ShpType.POLYGONZ], shpType)) {
    return 'polygon';
  } else if (Utils.contains([ShpType.POLYLINE, ShpType.POLYLINEM, ShpType.POLYLINEZ], shpType)) {
    return 'polyline';
  } else if (Utils.contains([ShpType.POINT, ShpType.POINTM, ShpType.POINTZ,
      ShpType.MULTIPOINT, ShpType.MULTIPOINTM, ShpType.MULTIPOINTZ], shpType)) {
    return 'point';
  }
  return null;
};

MapShaper.getShapefileType = function(type) {
  if (type === null) return ShpType.NULL;
  return {
    polygon: ShpType.POLYGON,
    polyline: ShpType.POLYLINE,
    point: ShpType.MULTIPOINT  // TODO: use POINT when possible
  }[type] || null;
};

// Read Shapefile data from an ArrayBuffer or Buffer
// Build topology
//
MapShaper.importShp = function(src, opts) {
  var reader = new ShpReader(src);
  var type = MapShaper.translateShapefileType(reader.type());
  if (!type) {
    stop("Unsupported Shapefile type:", reader.type());
  }
  if (reader.hasZ()) {
    verbose("Warning: Z data is being removed.");
  } else if (reader.hasM()) {
    verbose("Warning: M data is being removed.");
  }

  var pathPoints = type == 'point' ? 0 : reader.getCounts().pointCount;
  var importer = new PathImporter(pathPoints, opts);
  // var expectRings = Utils.contains([5,15,25], reader.type());
  // TODO: test cases: null shape; non-null shape with no valid parts

  reader.forEachShape(function(shp) {
    importer.startShape();
    if (shp.isNull) return;
    if (type == 'point') {
      importer.importPoints(shp.readPoints());
    } else {
      shp.readCoords().forEach(function(arr) {
        importer.importPathFromFlatArray(arr, type);
      });
    }
  });

  return importer.done();
};

// Convert topological data to buffers containing .shp and .shx file data
//
MapShaper.exportShp = function(layers, arcData, opts) {
  var files = [];
  layers.forEach(function(layer) {
    var data = layer.data,
        obj, dbf;
    T.start();
    obj = MapShaper.exportShpFile(layer, arcData);
    T.stop("Export .shp file");
    T.start();
    data = layer.data;
    // create empty data table if missing a table or table is being cut out
    if (!data || opts.cut_table) {
      data = new DataTable(layer.shapes.length);
    }
    // dbfs should have at least one column; add id field if none
    if (data.getFields().length === 0) {
      data.addIdField();
    }
    dbf = data.exportAsDbf(opts.encoding);
    T.stop("Export .dbf file");

    files.push({
        content: obj.shp,
        name: layer.name,
        extension: "shp"
      }, {
        content: obj.shx,
        name: layer.name,
        extension: "shx"
      }, {
        content: dbf,
        name: layer.name,
        extension: "dbf"
      });
  });
  return files;
};

MapShaper.exportShpFile = function(layer, arcData) {
  var geomType = layer.geometry_type;

  var shpType = MapShaper.getShapefileType(geomType);
  if (shpType === null)
    error("[exportShpFile()] Unable to export geometry type:", geomType);

  // var exporter = new PathExporter(arcData, isPolygonType);
  var fileBytes = 100;
  var bounds = new Bounds();
  var shapeBuffers = layer.shapes.map(function(shape, i) {
    var pathData = MapShaper.exportPathData(shape, arcData, geomType);
    var rec = MapShaper.exportShpRecord(pathData, i+1, shpType);
    fileBytes += rec.buffer.byteLength;
    if (rec.bounds) bounds.mergeBounds(rec.bounds);
    return rec.buffer;
  });

  if (!bounds.hasBounds()) {
    error("[exportShpFile()] Missing bounds", layer);
  }

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
  shapeBuffers.forEach(function(buf, i) {
    var shpOff = shpBin.position() / 2,
        shpSize = (buf.byteLength - 8) / 2; // alternative: shxBin.writeBuffer(buf, 4, 4);
    shxBin.writeInt32(shpOff);
    shxBin.writeInt32(shpSize);
    shpBin.writeBuffer(buf);
  });

  var shxBuf = shxBin.buffer(),
      shpBuf = shpBin.buffer();

  return {shp: shpBuf, shx: shxBuf};
};

// Returns an ArrayBuffer containing a Shapefile record for one shape
//   and the bounding box of the shape.
// TODO: remove collapsed rings, convert to null shape if necessary
//
MapShaper.exportShpRecord = function(data, id, shpType) {
  var bounds = null,
      bin = null;
  if (data.pointCount > 0) {
    var multiPart = ShpType.isMultiPartType(shpType),
        partIndexIdx = 52,
        pointsIdx = multiPart ? partIndexIdx + 4 * data.pathCount : 48,
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
      .writeFloat64(bounds.ymax);

    if (multiPart) {
      bin.writeInt32(data.pathCount);
    } else {
      if (data.pathData.length > 1) {
        error("[exportShpRecord()] Tried to export multiple paths as type:", shpType);
      }
    }

    bin.writeInt32(data.pointCount);

    data.pathData.forEach(function(path, i) {
      if (multiPart) {
        bin.position(partIndexIdx + i * 4).writeInt32(pointCount);
      }
      bin.position(pointsIdx + pointCount * 16);

      var xx = path.xx,
          yy = path.yy;
      for (var j=0, len=xx.length; j<len; j++) {
        bin.writeFloat64(xx[j]);
        bin.writeFloat64(yy[j]);
      }
      pointCount += j;
    });
    if (data.pointCount != pointCount)
      error("Shp record point count mismatch; pointCount:",
          pointCount, "data.pointCount:", data.pointCount);

  } else {
    // no data -- export null record
    bin = new BinArray(12, false)
      .writeInt32(id)
      .writeInt32(2)
      .littleEndian()
      .writeInt32(0);
  }

  return {bounds: bounds, buffer: bin.buffer()};
};
