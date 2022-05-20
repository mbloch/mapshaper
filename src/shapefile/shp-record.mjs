import ShpType from '../shapefile/shp-type';
import { error } from '../utils/mapshaper-logging';

function getNullRecord(id) {
  return {
    id: id,
    isNull: true,
    pointCount: 0,
    partCount: 0,
    byteLength: 12
  };
}

// Returns a constructor function for a shape record class with
//   properties and methods for reading coordinate data.
//
// Record properties
//   type, isNull, byteLength, pointCount, partCount (all types)
//
// Record methods
//   read(), readPoints() (all types)
//   readBounds(), readCoords()  (all but single point types)
//   readPartSizes() (polygon and polyline types)
//   readZBounds(), readZ() (Z types except POINTZ)
//   readMBounds(), readM(), hasM() (M and Z types, except POINT[MZ])
//
export default function ShpRecordClass(type) {
  var hasBounds = ShpType.hasBounds(type),
      hasParts = ShpType.isMultiPartType(type),
      hasZ = ShpType.isZType(type),
      hasM = ShpType.isMType(type),
      singlePoint = !hasBounds,
      mzRangeBytes = singlePoint ? 0 : 16,
      constructor, proto;

  // @bin is a BinArray set to the first data byte of a shape record
  constructor = function ShapeRecord(bin, bytes) {
    var pos = bin.position();
    this.id = bin.bigEndian().readUint32();
    this.type = bin.littleEndian().skipBytes(4).readUint32();
    if (this.type === 0 || type === 0) {
      return getNullRecord(this.id);
    }
    if (bytes > 0 !== true || (this.type != type && this.type !== 0)) {
      error("Unable to read a shape -- .shp file may be corrupted");
    }
    this.byteLength = bytes; // bin.readUint32() * 2 + 8; // bytes in content section + 8 header bytes
    if (singlePoint) {
      this.pointCount = 1;
      this.partCount = 1;
    } else {
      bin.skipBytes(32); // skip bbox
      this.partCount = hasParts ? bin.readUint32() : 1;
      this.pointCount = bin.readUint32();
    }
    this._data = function() {
      return bin.position(pos);
    };
  };

  // base prototype has methods shared by all Shapefile types except NULL type
  // (Type-specific methods are mixed in below)
  var baseProto = {
    // return offset of [x, y] point data in the record
    _xypos: function() {
      var offs = 12; // skip header & record type
      if (!singlePoint) offs += 4; // skip point count
      if (hasBounds) offs += 32;
      if (hasParts) offs += 4 * this.partCount + 4; // skip part count & index
      return offs;
    },

    readCoords: function() {
      if (this.pointCount === 0) return null;
      var partSizes = this.readPartSizes(),
          xy = this._data().skipBytes(this._xypos());

      return partSizes.map(function(pointCount) {
        return xy.readFloat64Array(pointCount * 2);
      });
    },

    readXY: function() {
      if (this.pointCount === 0) return new Float64Array(0);
      return this._data().skipBytes(this._xypos()).readFloat64Array(this.pointCount * 2);
    },

    readPoints: function() {
      var xy = this.readXY(),
          zz = hasZ ? this.readZ() : null,
          mm = hasM && this.hasM() ? this.readM() : null,
          points = [], p;

      for (var i=0, n=xy.length / 2; i<n; i++) {
        p = [xy[i*2], xy[i*2+1]];
        if (zz) p.push(zz[i]);
        if (mm) p.push(mm[i]);
        points.push(p);
      }
      return points;
    },

    // Return an array of point counts in each part
    // Parts containing zero points are skipped (Shapefiles with zero-point
    // parts are out-of-spec but exist in the wild).
    readPartSizes: function() {
      var sizes = [];
      var partLen, startId, bin;
      if (this.pointCount === 0) {
        // no parts
      } else if (this.partCount == 1) {
        // single-part type or multi-part type with one part
        sizes.push(this.pointCount);
      } else {
        // more than one part
        startId = 0;
        bin = this._data().skipBytes(56); // skip to second entry in part index
        for (var i=0, n=this.partCount; i<n; i++) {
          partLen = (i < n - 1 ? bin.readUint32() : this.pointCount) - startId;
          if (partLen > 0) {
            sizes.push(partLen);
            startId += partLen;
          }
        }
      }
      return sizes;
    }
  };

  var singlePointProto = {
    read: function() {
      var n = 2;
      if (hasZ) n++;
      if (this.hasM()) n++;
      return this._data().skipBytes(12).readFloat64Array(n);
    },

    stream: function(sink) {
      var src = this._data().skipBytes(12);
      sink.addPoint(src.readFloat64(), src.readFloat64());
      sink.endPath();
    }
  };

  var multiCoordProto = {
    readBounds: function() {
      return this._data().skipBytes(12).readFloat64Array(4);
    },

    stream: function(sink) {
      var sizes = this.readPartSizes(),
          xy = this.readXY(),
          i = 0, j = 0, n;
      while (i < sizes.length) {
        n = sizes[i];
        while (n-- > 0) {
          sink.addPoint(xy[j++], xy[j++]);
        }
        sink.endPath();
        i++;
      }
      if (xy.length != j) error('Counting error');
    },

    // TODO: consider switching to this simpler functino
    stream2: function(sink) {
      var sizes = this.readPartSizes(),
          bin = this._data().skipBytes(this._xypos()),
          i = 0, n;
      while (i < sizes.length) {
        n = sizes[i];
        while (n-- > 0) {
          sink.addPoint(bin.readFloat64(), bin.readFloat64());
        }
        sink.endPath();
        i++;
      }
    },

    read: function() {
      var parts = [],
          sizes = this.readPartSizes(),
          points = this.readPoints();
      for (var i=0, n = sizes.length - 1; i<n; i++) {
        parts.push(points.splice(0, sizes[i]));
      }
      parts.push(points);
      return parts;
    }
  };

  var mProto = {
    _mpos: function() {
      var pos = this._xypos() + this.pointCount * 16;
      if (hasZ) {
        pos += this.pointCount * 8 + mzRangeBytes;
      }
      return pos;
    },

    readMBounds: function() {
      return this.hasM() ? this._data().skipBytes(this._mpos()).readFloat64Array(2) : null;
    },

    // TODO: group into parts, like readCoords()
    readM: function() {
      return this.hasM() ? this._data().skipBytes(this._mpos() + mzRangeBytes).readFloat64Array(this.pointCount) : null;
    },

    // Test if this record contains M data
    // (according to the Shapefile spec, M data is optional in a record)
    //
    hasM: function() {
      var bytesWithoutM = this._mpos(),
          bytesWithM = bytesWithoutM + this.pointCount * 8 + mzRangeBytes;
      if (this.byteLength == bytesWithoutM) {
        return false;
      } else if (this.byteLength == bytesWithM) {
        return true;
      } else {
        error("#hasM() Counting error");
      }
    }
  };

  var zProto = {
    _zpos: function() {
      return this._xypos() + this.pointCount * 16;
    },

    readZBounds: function() {
      return this._data().skipBytes(this._zpos()).readFloat64Array(2);
    },

    // TODO: group into parts, like readCoords()
    readZ: function() {
      return this._data().skipBytes(this._zpos() + mzRangeBytes).readFloat64Array(this.pointCount);
    }
  };

  if (type === 0) {
    proto = {};
  } else if (singlePoint) {
    proto = Object.assign(baseProto, singlePointProto);
  } else {
    proto = Object.assign(baseProto, multiCoordProto);
  }
  if (hasZ) Object.assign(proto, zProto);
  if (hasM) Object.assign(proto, mProto);

  constructor.prototype = proto;
  proto.constructor = constructor;
  return constructor;
}
