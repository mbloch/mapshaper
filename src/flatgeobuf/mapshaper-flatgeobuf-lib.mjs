import { fromFeature } from 'flatgeobuf/lib/mjs/geojson/feature.js';
import { serialize } from 'flatgeobuf/lib/mjs/geojson/featurecollection.js';
import { buildHeader } from 'flatgeobuf/lib/mjs/generic/featurecollection.js';
import { magicbytes, SIZE_PREFIX_LEN } from 'flatgeobuf/lib/mjs/constants.js';
import { Header } from 'flatgeobuf/lib/mjs/flat-geobuf/header.js';
import { Crs } from 'flatgeobuf/lib/mjs/flat-geobuf/crs.js';
import { Column } from 'flatgeobuf/lib/mjs/flat-geobuf/column.js';
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

function buildHeaderWithCRS(headerMeta, crsMeta) {
  var builder = new flatbuffers.Builder();
  var columnsOffset = createColumnsVector(builder, headerMeta.columns || []);
  var crsOffset = createCrs(builder, crsMeta);
  var nameOffset = builder.createString((headerMeta && headerMeta.name) || 'L1');
  var titleOffset = headerMeta && headerMeta.title ? builder.createString(headerMeta.title) : 0;
  var descriptionOffset = headerMeta && headerMeta.description ? builder.createString(headerMeta.description) : 0;
  var metadataOffset = headerMeta && headerMeta.metadata ? builder.createString(headerMeta.metadata) : 0;

  Header.startHeader(builder);
  Header.addName(builder, nameOffset);
  if (crsOffset) Header.addCrs(builder, crsOffset);
  Header.addFeaturesCount(builder, BigInt(headerMeta.featuresCount || 0));
  Header.addGeometryType(builder, headerMeta.geometryType || 0);
  Header.addIndexNodeSize(builder, headerMeta.indexNodeSize || 0);
  if (columnsOffset) Header.addColumns(builder, columnsOffset);
  if (titleOffset) Header.addTitle(builder, titleOffset);
  if (descriptionOffset) Header.addDescription(builder, descriptionOffset);
  if (metadataOffset) Header.addMetadata(builder, metadataOffset);
  var offset = Header.endHeader(builder);
  builder.finishSizePrefixed(offset);
  return builder.asUint8Array();
}

function createColumnsVector(builder, columns) {
  if (!columns || columns.length === 0) return 0;
  var offsets = columns.map(function(col) {
    var nameOffset = builder.createString(col.name);
    var titleOffset = col.title ? builder.createString(col.title) : 0;
    var descriptionOffset = col.description ? builder.createString(col.description) : 0;
    var metadataOffset = col.metadata ? builder.createString(col.metadata) : 0;
    Column.startColumn(builder);
    Column.addName(builder, nameOffset);
    Column.addType(builder, col.type);
    if (titleOffset) Column.addTitle(builder, titleOffset);
    if (descriptionOffset) Column.addDescription(builder, descriptionOffset);
    if (typeof col.width == 'number') Column.addWidth(builder, col.width);
    if (typeof col.precision == 'number') Column.addPrecision(builder, col.precision);
    if (typeof col.scale == 'number') Column.addScale(builder, col.scale);
    if (typeof col.nullable == 'boolean') Column.addNullable(builder, col.nullable);
    if (typeof col.unique == 'boolean') Column.addUnique(builder, col.unique);
    if (typeof col.primary_key == 'boolean') Column.addPrimaryKey(builder, col.primary_key);
    if (metadataOffset) Column.addMetadata(builder, metadataOffset);
    return Column.endColumn(builder);
  });
  return Header.createColumnsVector(builder, offsets);
}

function createCrs(builder, crsMeta) {
  if (!crsMeta) return 0;
  var orgOffset = crsMeta.org ? builder.createString(crsMeta.org) : 0;
  var nameOffset = crsMeta.name ? builder.createString(crsMeta.name) : 0;
  var descriptionOffset = crsMeta.description ? builder.createString(crsMeta.description) : 0;
  var wktOffset = crsMeta.wkt ? builder.createString(crsMeta.wkt) : 0;
  var codeStringOffset = crsMeta.code_string ? builder.createString(crsMeta.code_string) : 0;
  Crs.startCrs(builder);
  if (orgOffset) Crs.addOrg(builder, orgOffset);
  if (typeof crsMeta.code == 'number') Crs.addCode(builder, crsMeta.code);
  if (nameOffset) Crs.addName(builder, nameOffset);
  if (descriptionOffset) Crs.addDescription(builder, descriptionOffset);
  if (wktOffset) Crs.addWkt(builder, wktOffset);
  if (codeStringOffset) Crs.addCodeString(builder, codeStringOffset);
  return Crs.endCrs(builder);
}

export {
  getHeaderMeta,
  getFeatureReader,
  serialize,
  buildHeader,
  buildHeaderWithCRS,
  magicbytes,
  SIZE_PREFIX_LEN
};
