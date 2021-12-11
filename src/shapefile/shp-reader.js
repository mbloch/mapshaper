
import ShpRecordClass from '../shapefile/shp-record';
import { error, verbose, message, stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { FileReader, BufferReader } from '../io/mapshaper-file-reader';
import { isSupportedShapefileType } from '../shapefile/shp-common';

// Read data from a .shp file
// @src is an ArrayBuffer, Node.js Buffer or filename
//
//    // Example: iterating using #nextShape()
//    var reader = new ShpReader(buf), s;
//    while (s = reader.nextShape()) {
//      // process the raw coordinate data yourself...
//      var coords = s.readCoords(); // [[x,y,x,y,...], ...] Array of parts
//      var zdata = s.readZ();  // [z,z,...]
//      var mdata = s.readM();  // [m,m,...] or null
//      // .. or read the shape into nested arrays
//      var data = s.read();
//    }
//
//    // Example: reading records using a callback
//    var reader = new ShpReader(buf);
//    reader.forEachShape(function(s) {
//      var data = s.read();
//    });
//
export function ShpReader(shpSrc, shxSrc) {
  if (this instanceof ShpReader === false) {
    return new ShpReader(shpSrc, shxSrc);
  }

  var shpFile = utils.isString(shpSrc) ? new FileReader(shpSrc) : new BufferReader(shpSrc);
  var header = parseHeader(shpFile.readToBinArray(0, 100));
  var shpSize = shpFile.size();
  var RecordClass = new ShpRecordClass(header.type);
  var shpOffset, recordCount;
  var shxBin, shxFile;

  if (shxSrc) {
    shxFile = utils.isString(shxSrc) ? new FileReader(shxSrc) : new BufferReader(shxSrc);
    shxBin = shxFile.readToBinArray(0, shxFile.size()).bigEndian();
  }

  reset();

  this.header = function() {
    return header;
  };

  // Callback interface: for each record in a .shp file, pass a
  //   record object to a callback function
  //
  this.forEachShape = function(callback) {
    var shape = this.nextShape();
    while (shape) {
      callback(shape);
      shape = this.nextShape();
    }
  };

  // Iterator interface for reading shape records
  this.nextShape = function() {
    var shape = readNextShape(recordCount);
    if (shape) {
      recordCount++;
    } else {
      shpFile.close();
      reset();
    }
    return shape;
  };

  // Returns a shape record or null if no more shapes can be read
  //
  function readNextShape(i) {
    var expectedId = i + 1; // Shapefile ids are 1-based
    var shape, offset;
    if (shxBin) {
      if (shxFile.size() <= 100 + i * 8) return null; // done
      shxBin.position(100 + i * 8);
      offset = shxBin.readUint32() * 2;
      shape = readIndexedShape(shpFile, offset, expectedId);
    } else {
      // Reading without a .shx file (returns null at end-of-file)
      offset = shpOffset;
      shape = readNonIndexedShape(shpFile, offset, expectedId);
    }
    return shape || null;
  }

  function reset() {
    shpOffset = 100;
    recordCount = 0;
  }

  function parseHeader(bin) {
    var header = {
      signature: bin.bigEndian().readUint32(),
      byteLength: bin.skipBytes(20).readUint32() * 2,
      version: bin.littleEndian().readUint32(),
      type: bin.readUint32(),
      bounds: bin.readFloat64Array(4), // xmin, ymin, xmax, ymax
      zbounds: bin.readFloat64Array(2),
      mbounds: bin.readFloat64Array(2)
    };

    if (header.signature != 9994) {
      error("Not a valid .shp file");
    }

    if (!isSupportedShapefileType(header.type)) {
      error("Unsupported .shp type:", header.type);
    }

    if (header.byteLength != shpFile.size()) {
      error("File size of .shp doesn't match size in header");
    }

    return header;
  }


  function readShapeAtOffset(shpFile, offset) {
    var shape = null,
        recordSize, recordType, recordId, goodSize, goodType, bin;

    if (offset + 12 <= shpSize) {
      bin = shpFile.readToBinArray(offset, 12);
      recordId = bin.bigEndian().readUint32();
      // record size is bytes in content section + 8 header bytes
      recordSize = bin.readUint32() * 2 + 8;
      recordType = bin.littleEndian().readUint32();
      goodSize = offset + recordSize <= shpSize && recordSize >= 12;
      goodType = recordType === 0 || recordType == header.type;
      if (goodSize && goodType) {
        bin = shpFile.readToBinArray(offset, recordSize);
        shape = new RecordClass(bin, recordSize);
      }
    }
    return shape;
  }

  function readIndexedShape(shpFile, offset, expectedId) {
    var shape = readShapeAtOffset(shpFile, offset);
    if (!shape) {
      stop('Index of Shapefile record', expectedId, 'in the .shx file is invalid.');
    }
    if (shape.id != expectedId) {
      // stop("Found a Shapefile record with an out-of-sequence id (" + shape.id + ") -- bailing.");
      message(`Warning: A feature has a different record number in .shx (${expectedId}) and .shp (${shape.id}).`);
    }
    // TODO: consider printing verbose message if a .shp file contains garbage bytes
    // example files:
    // ne_10m_admin_0_boundary_lines_land.shp
    // ne_110m_admin_0_scale_rank.shp
    return shape;
  }

  // The Shapefile specification does not require records to be densely packed or
  // in consecutive sequence in the .shp file. This is a problem when the .shx
  // index file is not present.
  //
  // Here, we try to scan past invalid content to find the next record.
  // Records are required to be in sequential order.
  //
  function readNonIndexedShape(shpFile, start, expectedId) {
    var offset = start,
        fileSize = shpFile.size(),
        shape = null,
        bin, recordId, recordType, isValidType;
    while (offset + 12 <= fileSize) {
      bin = shpFile.readToBinArray(offset, 12);
      recordId = bin.bigEndian().readUint32();
      recordType = bin.littleEndian().skipBytes(4).readUint32();
      isValidType = recordType == header.type || recordType === 0;
      if (!isValidType || recordId != expectedId && recordType === 0) {
        offset += 4; // keep scanning -- try next integer position
        continue;
      }
      shape = readShapeAtOffset(shpFile, offset);
      if (!shape) break; // probably ran into end of file
      shpOffset = offset + shape.byteLength; // update
      if (recordId == expectedId) break; // found an apparently valid shape
      if (recordId < expectedId) {
        message("Found a Shapefile record with the same id as a previous record (" + shape.id + ") -- skipping.");
        offset += shape.byteLength;
      } else {
        stop("Shapefile contains an out-of-sequence record. Possible data corruption -- bailing.");
      }
    }
    if (shape && offset > start) {
      verbose("Skipped over " + (offset - start) + " non-data bytes in the .shp file.");
    }
    return shape;
  }
}

ShpReader.prototype.type = function() {
  return this.header().type;
};

ShpReader.prototype.getCounts = function() {
  var counts = {
    nullCount: 0,
    partCount: 0,
    shapeCount: 0,
    pointCount: 0
  };
  this.forEachShape(function(shp) {
    if (shp.isNull) counts.nullCount++;
    counts.pointCount += shp.pointCount;
    counts.partCount += shp.partCount;
    counts.shapeCount++;
  });
  return counts;
};
