import { fromFeature } from 'flatgeobuf/lib/mjs/geojson/feature.js';
import { serialize } from 'flatgeobuf/lib/mjs/geojson/featurecollection.js';
import { magicbytes, SIZE_PREFIX_LEN } from 'flatgeobuf/lib/mjs/constants.js';
import * as flatbuffers from 'flatbuffers';
import { fromByteBuffer } from 'flatgeobuf/lib/mjs/header-meta.js';
import { calcTreeSize } from 'flatgeobuf/lib/mjs/packedrtree.js';
import { Feature } from 'flatgeobuf/lib/mjs/flat-geobuf/feature.js';


// bytes: Uint8Array
function getHeaderMeta(bytes) {
  if (!bytes.subarray(0, 3).every((v, i) => magicbytes[i] === v)) {
    throw new Error('Not a FlatGeobuf file');
  }
  var bb = new flatbuffers.ByteBuffer(bytes);
  bb.setPosition(magicbytes.length + SIZE_PREFIX_LEN);
  return fromByteBuffer(bb);
}

// bytes: Uint8Array
function getFeatureReader(bytes, headerMetaArg) {
  if (!bytes.subarray(0, 3).every((v, i) => magicbytes[i] === v)) {
    throw new Error('Not a FlatGeobuf file');
  }
  var bb = new flatbuffers.ByteBuffer(bytes);
  var headerLength = bb.readUint32(magicbytes.length);
  var headerMeta = headerMetaArg || getHeaderMeta(bytes);
  var offset = magicbytes.length + SIZE_PREFIX_LEN + headerLength;
  var { indexNodeSize, featuresCount } = headerMeta;
  // protect against infinite loop in calcTreeSize()
  if (indexNodeSize > 0 && featuresCount > 0) {
    offset += calcTreeSize(featuresCount, indexNodeSize);
  }
  var id = 0;
  return function readFeature() {
    var geojsonFeature;
    if (offset >= bb.capacity()) {
      return null;
    }
    var featureLength = bb.readUint32(offset);
    bb.setPosition(offset);
    var feature = Feature.getSizePrefixedRootAsFeature(bb);
    geojsonFeature = fromFeature(id++, feature, headerMeta);
    offset += SIZE_PREFIX_LEN + featureLength;
    return geojsonFeature;
  };
}

export { getHeaderMeta, getFeatureReader, serialize };
