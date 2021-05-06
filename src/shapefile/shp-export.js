import { exportPathData } from '../paths/mapshaper-path-export';
import { getFeatureCount } from '../dataset/mapshaper-layer-utils';
import { findMaxPartCount } from '../paths/mapshaper-shape-utils';
import { getDatasetCRS, crsToPrj } from '../crs/mapshaper-projections';
import { exportDbfFile } from '../shapefile/dbf-export';
import { message, error } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import ShpType from '../shapefile/shp-type';
import { Bounds } from '../geom/mapshaper-bounds';
import { BinArray } from '../utils/mapshaper-binarray';

// Convert a dataset to Shapefile files
export function exportShapefile(dataset, opts) {
  return dataset.layers.reduce(function(files, lyr) {
    var prj = exportPrjFile(lyr, dataset);
    files = files.concat(exportShpAndShxFiles(lyr, dataset, opts));
    files = files.concat(exportDbfFile(lyr, dataset, opts));
    if (prj) files.push(prj);
    return files;
  }, []);
}

function exportPrjFile(lyr, dataset) {
  var info = dataset.info || {};
  var prj = info.prj;
  if (!prj) {
    try {
      prj = crsToPrj(getDatasetCRS(dataset));
    } catch(e) {}
  }
  if (!prj) {
    message("Unable to generate .prj file for", lyr.name + '.shp');
  }
  return prj ? {
    content: prj,
    filename: lyr.name + '.prj'
  } : null;
}

function getShapefileExportType(lyr) {
  var type = lyr.geometry_type;
  var shpType;
  if (type == 'point') {
    shpType = findMaxPartCount(lyr.shapes || []) <= 1 ? ShpType.POINT : ShpType.MULTIPOINT;
  } else if (type == 'polygon') {
    shpType = ShpType.POLYGON;
  } else if (type == 'polyline') {
    shpType = ShpType.POLYLINE;
  } else {
    shpType = ShpType.NULL;
  }
  return shpType;
}

function exportShpAndShxFiles(layer, dataset, opts) {
  var shapes = layer.shapes || utils.initializeArray(new Array(getFeatureCount(layer)), null);
  var bounds = new Bounds();
  var shpType = getShapefileExportType(layer);
  var fileBytes = 100;
  var shxBytes = 100 + shapes.length * 8;
  var shxBin = new BinArray(shxBytes).bigEndian().position(100); // jump to record section
  var shpBin;

  // TODO: consider writing records to an expanding buffer instead of generating
  // individual buffers for each record (for large point datasets,
  // creating millions of buffers impacts performance significantly)
  var shapeBuffers = shapes.map(function(shape, i) {
    var pathData = exportPathData(shape, dataset.arcs, layer.geometry_type);
    var rec = exportShpRecord(pathData, i+1, shpType);
    var recBytes = rec.buffer.byteLength;

    // add shx record
    shxBin.writeInt32(fileBytes / 2); // record offset in 16-bit words
    // alternative to below: shxBin.writeBuffer(rec.buffer, 4, 4)
    shxBin.writeInt32(recBytes / 2 - 4); // record content length in 16-bit words

    fileBytes += recBytes;
    if (rec.bounds) bounds.mergeBounds(rec.bounds);
    return rec.buffer;
  });

  // write .shp header section
  shpBin = new BinArray(fileBytes, false)
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

  // write records section of .shp
  shapeBuffers.forEach(function(buf) {
    shpBin.writeBuffer(buf);
  });

  // write .shx header
  shxBin.position(0)
    .writeBuffer(shpBin.buffer(), 100) // copy .shp header to .shx
    .position(24) // substitute shx file size for shp file size
    .writeInt32(shxBytes / 2);

  return [{
      content: shpBin.buffer(),
      filename: layer.name + ".shp"
    }, {
      content: shxBin.buffer(),
      filename: layer.name + ".shx"
    }];
}

// Returns an ArrayBuffer containing a Shapefile record for one shape
//   and the bounding box of the shape.
// TODO: remove collapsed rings, convert to null shape if necessary
//
function exportShpRecord(data, id, shpType) {
  var multiPartType = ShpType.isMultiPartType(shpType),
      singlePointType = !multiPartType && !ShpType.isMultiPointType(shpType),
      isNull = data.pointCount > 0 === false,
      bounds = isNull ? null : data.bounds,
      bin = null;

  if (isNull) {
    bin = new BinArray(12, false)
      .writeInt32(id)
      .writeInt32(2)
      .littleEndian()
      .writeInt32(0);

  } else if (singlePointType) {
    bin = new BinArray(28, false)
      .writeInt32(id)
      .writeInt32(10)
      .littleEndian()
      .writeInt32(shpType)
      .writeFloat64(data.pathData[0].points[0][0])
      .writeFloat64(data.pathData[0].points[0][1]);

  } else {
    var partIndexIdx = 52,
        pointsIdx = multiPartType ? partIndexIdx + 4 * data.pathCount : 48,
        recordBytes = pointsIdx + 16 * data.pointCount,
        pointCount = 0;

    bin = new BinArray(recordBytes, false)
      .writeInt32(id)
      .writeInt32((recordBytes - 8) / 2)
      .littleEndian()
      .writeInt32(shpType)
      .writeFloat64(bounds.xmin)
      .writeFloat64(bounds.ymin)
      .writeFloat64(bounds.xmax)
      .writeFloat64(bounds.ymax);

    if (multiPartType) {
      bin.writeInt32(data.pathCount);
    }

    bin.writeInt32(data.pointCount);
    data.pathData.forEach(function(path, i) {
      if (multiPartType) {
        bin.position(partIndexIdx + i * 4).writeInt32(pointCount);
      }
      bin.position(pointsIdx + pointCount * 16);
      for (var j=0, len=path.points.length; j<len; j++) {
        bin.writeFloat64(path.points[j][0]);
        bin.writeFloat64(path.points[j][1]);
      }
      pointCount += j;
    });
    if (data.pointCount != pointCount) {
      error("Shp record point count mismatch; pointCount:",
          pointCount, "data.pointCount:", data.pointCount);
    }
  }

  return {bounds: bounds, buffer: bin.buffer()};
}
