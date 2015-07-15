/* @requires
mapshaper-geom,
shp-reader,
dbf-reader,
mapshaper-path-import,
mapshaper-path-export,
mapshaper-dbf-table
*/

MapShaper.translateShapefileType = function(shpType) {
  if (utils.contains([ShpType.POLYGON, ShpType.POLYGONM, ShpType.POLYGONZ], shpType)) {
    return 'polygon';
  } else if (utils.contains([ShpType.POLYLINE, ShpType.POLYLINEM, ShpType.POLYLINEZ], shpType)) {
    return 'polyline';
  } else if (utils.contains([ShpType.POINT, ShpType.POINTM, ShpType.POINTZ,
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

// Convert a dataset to Shapefile files
MapShaper.exportShapefile = function(dataset, opts) {
  return dataset.layers.reduce(function(files, lyr) {
    var prj = MapShaper.exportPrjFile(lyr, dataset);
    files = files.concat(MapShaper.exportShpAndShxFiles(lyr, dataset, opts));
    files = files.concat(MapShaper.exportDbfFile(lyr, dataset, opts));
    if (prj) files.push(prj);
    return files;
  }, []);
};

MapShaper.exportPrjFile = function(lyr, dataset) {
  var outputPrj = dataset.info.output_prj;
  if (!outputPrj && outputPrj !== null) { // null value indicates crs is unknown
    outputPrj = dataset.info.input_prj;
  }
  return outputPrj ? {
    content: outputPrj,
    filename: lyr.name + '.prj'
  } : null;
};

MapShaper.exportShpAndShxFiles = function(layer, dataset, opts) {
  var geomType = layer.geometry_type;
  var shpType = MapShaper.getShapefileType(geomType);
  if (shpType === null) {
    error("[exportShpAndShx()] Unable to export geometry type:", geomType);
  }

  var fileBytes = 100;
  var bounds = new Bounds();
  var shapeBuffers = layer.shapes.map(function(shape, i) {
    var pathData = MapShaper.exportPathData(shape, dataset.arcs, geomType);
    var rec = MapShaper.exportShpRecord(pathData, i+1, shpType);
    fileBytes += rec.buffer.byteLength;
    if (rec.bounds) bounds.mergeBounds(rec.bounds);
    return rec.buffer;
  });

  // write .shp header section
  var shpBin = new BinArray(fileBytes, false)
    .writeInt32(9994)
    .skipBytes(5 * 4)
    .writeInt32(fileBytes / 2)
    .littleEndian()
    .writeInt32(1000)
    .writeInt32(shpType);

  if (bounds.hasBounds()) {
    shpBin.writeFloat64(bounds.xmin || 0) // using 0s as empty value
      .writeFloat64(bounds.ymin || 0)
      .writeFloat64(bounds.xmax || 0)
      .writeFloat64(bounds.ymax || 0);
  } else {
    // no bounds -- assume no shapes or all null shapes -- using 0s as bbox
    shpBin.skipBytes(4 * 8);
  }

  shpBin.skipBytes(4 * 8); // skip Z & M type bounding boxes;

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

  return [{
      content: shpBin.buffer(),
      filename: layer.name + ".shp"
    }, {
      content: shxBin.buffer(),
      filename: layer.name + ".shx"
    }];
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

      var points = path.points;
      for (var j=0, len=points.length; j<len; j++) {
        bin.writeFloat64(points[j][0]);
        bin.writeFloat64(points[j][1]);
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
