
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
  var shpType = header.type;
  var shpOffset = 100; // used when reading .shp without .shx
  var recordCount = 0;
  var badRecordNumberCount = 0;
  var RecordClass = new ShpRecordClass(shpType);
  var shxBin, shxFile;

  if (shxSrc) {
    shxFile = utils.isString(shxSrc) ? new FileReader(shxSrc) : new BufferReader(shxSrc);
    shxBin = shxFile.readToBinArray(0, shxFile.size()).bigEndian();
  }

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
    var shape;
    if (!shpFile) {
      error('Tried to read from a used ShpReader');
      // return null; // this reader was already used
    }
    shape = readNextShape(recordCount);
    if (!shape) {
      done();
      return null;
    }
    recordCount++;
    return shape;
  };

  // Returns a shape record or null if no more shapes can be read
  // i: Expected 0-based index of the next record
  //
  function readNextShape(i) {
    return shxBin ?
      readIndexedShape(shpFile, shxBin, i) :
      readNonIndexedShape(shpFile, shpOffset, i);
  }

  function done() {
    shpFile.close();
    shpFile = shxFile = shxBin = null;
    if (badRecordNumberCount > 0) {
      message(`Warning: ${badRecordNumberCount}/${recordCount} features have non-standard record numbers in the .shp file.`);
    }
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
    var fileSize = shpFile.size();
    if (offset + 12 > fileSize) return null; // reached end-of-file
    var bin = shpFile.readToBinArray(offset, 12);
    var recordId = bin.bigEndian().readUint32();
    // record size is bytes in content section + 8 header bytes
    var recordSize = bin.readUint32() * 2 + 8;
    var recordType = bin.littleEndian().readUint32();
    var goodSize = offset + recordSize <= fileSize && recordSize >= 12;
    var goodType = recordType === 0 || recordType == shpType;
    if (!goodSize || !goodType) {
      return null;
    }
    bin = shpFile.readToBinArray(offset, recordSize);
    return new RecordClass(bin, recordSize);
  }

  function readIndexedShape(shpFile, shxBin, i) {
    if (shxBin.size() <= 100 + i * 8) return null; // done
    shxBin.position(100 + i * 8);
    var expectedId = i + 1;
    var offset = shxBin.readUint32() * 2;
    var recLen = shxBin.readUint32() * 2; // TODO: match this to recLen in .shp
    var shape = readShapeAtOffset(shpFile, offset);
    if (!shape) {
      stop('Index of Shapefile record', expectedId, 'in the .shx file is invalid.');
    }
    if (shape.id != expectedId) {
      badRecordNumberCount++;
      verbose(`Warning: A feature has a different record number in .shx (${expectedId}) and .shp (${shape.id}).`);
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
  // Here, we try to scan past any invalid content to find the next record.
  // Records are required to be in sequential order.
  //
  function readNonIndexedShape(shpFile, start, i) {
    var expectedId = i + 1, // Shapefile ids are 1-based
        offset = start,
        fileSize = shpFile.size(),
        shape = null,
        bin, recordId, recordType, isValidType;
    while (offset + 12 <= fileSize) {
      bin = shpFile.readToBinArray(offset, 12);
      recordId = bin.bigEndian().readUint32();
      recordType = bin.littleEndian().skipBytes(4).readUint32();
      isValidType = recordType == shpType || recordType === 0;
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

