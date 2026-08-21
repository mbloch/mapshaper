import { fromFeature } from 'flatgeobuf/lib/mjs/geojson/feature.js';
import { serialize } from 'flatgeobuf/lib/mjs/geojson/featurecollection.js';
import { buildFeature, parseProperties } from 'flatgeobuf/lib/mjs/generic/feature.js';
import { buildHeader } from 'flatgeobuf/lib/mjs/generic/featurecollection.js';
import { magicbytes, SIZE_PREFIX_LEN } from 'flatgeobuf/lib/mjs/constants.js';
import { Header } from 'flatgeobuf/lib/mjs/flat-geobuf/header.js';
import { Crs } from 'flatgeobuf/lib/mjs/flat-geobuf/crs.js';
import { Column } from 'flatgeobuf/lib/mjs/flat-geobuf/column.js';
import { GeometryType } from 'flatgeobuf/lib/mjs/flat-geobuf/geometry-type.js';
import { parseGC, parseGeometry } from 'flatgeobuf/lib/mjs/geojson/geometry.js';
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
  var header = Header.getRootAsHeader(bb);
  var meta = fromByteBuffer(bb);
  // The library's header-meta helper omits the FlatGeobuf dataset name.
  meta.name = header.name();
  return meta;
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
    geojsonFeature = readGeoJSONFeature(feature, headerMeta, id++);
    delete geojsonFeature.id;
    offset += SIZE_PREFIX_LEN + featureLength;
    return geojsonFeature;
  };
}

// The geometry field of a FlatGeobuf Feature is optional; fromFeature() assumes
// it is present, so features without one are converted here.
function readGeoJSONFeature(feature, headerMeta, id) {
  if (feature.geometry() === null) {
    return {
      type: 'Feature',
      id: id,
      geometry: null,
      properties: parseProperties(feature, headerMeta.columns)
    };
  }
  return fromFeature(id, feature, headerMeta);
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

// source: a feature cursor, {length, getFeature(i)}. Features are pulled and
// encoded one at a time rather than as a collection, because the GeoJSON form
// of a layer is several times larger than the FlatGeobuf it encodes into.
function serializeWithColumns(source, columns, name) {
  if (source.length === 0) {
    throw new Error('Could not infer geometry type for collection of features.');
  }
  // The header precedes the features and declares the collection's geometry
  // type, but that type isn't known until every feature has been seen. Assume
  // the layer is homogeneous, which nearly all are, and encode again as
  // Unknown in the rare case that it isn't.
  return encodeCollection(source, columns, name, null) ||
    encodeCollection(source, columns, name, GeometryType.Unknown);
}

// Returns null if forcedType is null and the features turn out to have more
// than one geometry type.
function encodeCollection(source, columns, name, forcedType) {
  var headerMeta = null;
  var sink = null;
  // Null-geometry features encountered before the collection's geometry type is
  // known, and therefore before the header can be written.
  var deferred = [];
  for (var i = 0; i < source.length; i++) {
    var feature = source.getFeature(i);
    var properties = normalizeProperties(feature.properties, columns);
    if (!feature.geometry) {
      // A feature's geometry can go missing during export -- e.g. a path that
      // collapses to a single point at the output coordinate precision -- and a
      // layer can also contain null shapes to begin with. Write a record with
      // no geometry, matching what the GeoJSON and Shapefile exporters do.
      // Such a feature says nothing about the collection's geometry type, so it
      // must not make a homogeneous layer look mixed.
      var nullFeature = buildNullGeometryFeature(properties, columns);
      if (sink) {
        sink.append(nullFeature);
      } else {
        deferred.push(nullFeature);
      }
      continue;
    }
    var type = GeometryType[feature.geometry.type] || GeometryType.Unknown;
    if (!headerMeta) {
      headerMeta = getEncodedHeaderMeta(
        forcedType === null ? type : forcedType, columns, source.length, name);
      sink = initSink(source, headerMeta, deferred);
    } else if (forcedType === null && type != headerMeta.geometryType) {
      return null;
    }
    var geometry = feature.geometry.type == 'GeometryCollection' ?
      parseGC(feature.geometry) :
      parseGeometry(feature.geometry);
    omitRedundantGeometryType(geometry, headerMeta.geometryType);
    sink.append(buildFeature(geometry, properties, headerMeta));
  }
  if (!sink) {
    // No feature had a geometry, so the collection has no geometry type.
    headerMeta = getEncodedHeaderMeta(
      forcedType === null ? GeometryType.Unknown : forcedType, columns, source.length, name);
    sink = initSink(source, headerMeta, deferred);
  }
  return sink.toBytes();
}

function getEncodedHeaderMeta(geometryType, columns, featuresCount, name) {
  return {
    name: name,
    geometryType: geometryType,
    columns: columns,
    envelope: null,
    featuresCount: featuresCount,
    indexNodeSize: 0,
    crs: null,
    title: null,
    description: null,
    metadata: null
  };
}

function initSink(source, headerMeta, deferredFeatures) {
  var sink = new ByteSink(magicbytes.length + estimateEncodedBytes(source));
  sink.append(magicbytes);
  sink.append(buildHeaderWithCRS(headerMeta, null));
  for (var i = 0; i < deferredFeatures.length; i++) {
    sink.append(deferredFeatures[i]);
  }
  return sink;
}

// Encodes a feature with attributes but no geometry, which FlatGeobuf supports
// by omitting the Feature table's optional geometry field. buildFeature() always
// writes a geometry, so the properties are encoded with it and then re-emitted:
// property values are written in a typed binary layout that is better read from
// one implementation than copied.
function buildNullGeometryFeature(properties, columns) {
  var meta = {columns: columns};
  var withGeometry = buildFeature({xy: [], type: GeometryType.Unknown}, properties, meta);
  var bb = new flatbuffers.ByteBuffer(withGeometry);
  var propertyBytes = Feature.getSizePrefixedRootAsFeature(bb).propertiesArray();
  var builder = new flatbuffers.Builder();
  // Features are concatenated in the file and read in place, so every feature
  // buffer has to leave the next one 8-byte aligned or reading a Float64 array
  // of coordinates from it throws. Buffers holding coordinates are padded to a
  // multiple of 8 because of those arrays; a feature with only property bytes
  // needs the alignment requested explicitly.
  builder.prep(8, 0);
  var propertiesOffset = propertyBytes && propertyBytes.length > 0 ?
    Feature.createPropertiesVector(builder, propertyBytes) : 0;
  Feature.startFeature(builder);
  if (propertiesOffset) Feature.addProperties(builder, propertiesOffset);
  builder.finishSizePrefixed(Feature.endFeature(builder));
  return builder.asUint8Array();
}

// Encoding the first feature is the only sample available before the buffer
// has to be allocated; overshooting costs a resize, which is why it is loose.
function estimateEncodedBytes(source) {
  return Math.max(source.length * 64, 1024);
}

function ByteSink(initialSize) {
  this.bytes = new Uint8Array(initialSize);
  this.length = 0;
}

ByteSink.prototype.append = function(chunk) {
  if (this.length + chunk.length > this.bytes.length) {
    var size = this.bytes.length;
    while (size < this.length + chunk.length) size *= 2;
    var grown = new Uint8Array(size);
    grown.set(this.bytes.subarray(0, this.length));
    this.bytes = grown;
  }
  this.bytes.set(chunk, this.length);
  this.length += chunk.length;
};

ByteSink.prototype.toBytes = function() {
  return this.bytes.subarray(0, this.length);
};

function omitRedundantGeometryType(geometry, headerType) {
  if (headerType != GeometryType.Unknown && geometry.type == headerType) {
    geometry.type = GeometryType.Unknown;
  }
}

function normalizeProperties(properties, columns) {
  var copy = {};
  properties = properties || {};
  columns.forEach(function(column) {
    var val = properties[column.name];
    copy[column.name] = val === undefined ? null : val;
  });
  return copy;
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
  serializeWithColumns,
  buildHeader,
  buildHeaderWithCRS,
  magicbytes,
  SIZE_PREFIX_LEN
};
