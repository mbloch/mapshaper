(function () {
  'use strict';

  /** @type {import('../src/types.d.ts').ParquetType[]} */
  const ParquetTypes = [
    'BOOLEAN',
    'INT32',
    'INT64',
    'INT96', // deprecated
    'FLOAT',
    'DOUBLE',
    'BYTE_ARRAY',
    'FIXED_LEN_BYTE_ARRAY',
  ];

  /** @type {import('../src/types.d.ts').Encoding[]} */
  const Encodings = [
    'PLAIN',
    'GROUP_VAR_INT', // deprecated
    'PLAIN_DICTIONARY',
    'RLE',
    'BIT_PACKED', // deprecated
    'DELTA_BINARY_PACKED',
    'DELTA_LENGTH_BYTE_ARRAY',
    'DELTA_BYTE_ARRAY',
    'RLE_DICTIONARY',
    'BYTE_STREAM_SPLIT',
  ];

  /** @type {import('../src/types.d.ts').FieldRepetitionType[]} */
  const FieldRepetitionTypes = [
    'REQUIRED',
    'OPTIONAL',
    'REPEATED',
  ];

  /** @type {import('../src/types.d.ts').ConvertedType[]} */
  const ConvertedTypes = [
    'UTF8',
    'MAP',
    'MAP_KEY_VALUE',
    'LIST',
    'ENUM',
    'DECIMAL',
    'DATE',
    'TIME_MILLIS',
    'TIME_MICROS',
    'TIMESTAMP_MILLIS',
    'TIMESTAMP_MICROS',
    'UINT_8',
    'UINT_16',
    'UINT_32',
    'UINT_64',
    'INT_8',
    'INT_16',
    'INT_32',
    'INT_64',
    'JSON',
    'BSON',
    'INTERVAL',
  ];

  /** @type {import('../src/types.d.ts').CompressionCodec[]} */
  const CompressionCodecs = [
    'UNCOMPRESSED',
    'SNAPPY',
    'GZIP',
    'LZO',
    'BROTLI',
    'LZ4',
    'ZSTD',
    'LZ4_RAW',
  ];

  /** @type {import('../src/types.d.ts').PageType[]} */
  const PageTypes = [
    'DATA_PAGE',
    'INDEX_PAGE',
    'DICTIONARY_PAGE',
    'DATA_PAGE_V2',
  ];

  /** @type {import('../src/types.d.ts').BoundaryOrder[]} */
  const BoundaryOrders = [
    'UNORDERED',
    'ASCENDING',
    'DESCENDING',
  ];

  /** @type {import('../src/types.d.ts').EdgeInterpolationAlgorithm[]} */
  const EdgeInterpolationAlgorithms = [
    'SPHERICAL',
    'VINCENTY',
    'THOMAS',
    'ANDOYER',
    'KARNEY',
  ];

  /**
   * WKB (Well-Known Binary) decoder for geometry objects.
   *
   * @param {DataReader} reader
   * @returns {Geometry} geometry object
   */
  function wkbToGeojson(reader) {
    const flags = getFlags(reader);

    if (flags.type === 1) { // Point
      return { type: 'Point', coordinates: readPosition(reader, flags) }
    } else if (flags.type === 2) { // LineString
      return { type: 'LineString', coordinates: readLine(reader, flags) }
    } else if (flags.type === 3) { // Polygon
      return { type: 'Polygon', coordinates: readPolygon(reader, flags) }
    } else if (flags.type === 4) { // MultiPoint
      const points = [];
      for (let i = 0; i < flags.count; i++) {
        points.push(readPosition(reader, getFlags(reader)));
      }
      return { type: 'MultiPoint', coordinates: points }
    } else if (flags.type === 5) { // MultiLineString
      const lines = [];
      for (let i = 0; i < flags.count; i++) {
        lines.push(readLine(reader, getFlags(reader)));
      }
      return { type: 'MultiLineString', coordinates: lines }
    } else if (flags.type === 6) { // MultiPolygon
      const polygons = [];
      for (let i = 0; i < flags.count; i++) {
        polygons.push(readPolygon(reader, getFlags(reader)));
      }
      return { type: 'MultiPolygon', coordinates: polygons }
    } else if (flags.type === 7) { // GeometryCollection
      const geometries = [];
      for (let i = 0; i < flags.count; i++) {
        geometries.push(wkbToGeojson(reader));
      }
      return { type: 'GeometryCollection', geometries }
    } else {
      throw new Error(`Unsupported geometry type: ${flags.type}`)
    }
  }

  /**
   * Extract ISO WKB flags and base geometry type.
   *
   * @param {DataReader} reader
   * @returns {WkbFlags}
   */
  function getFlags(reader) {
    const { view } = reader;
    const littleEndian = view.getUint8(reader.offset++) === 1;
    const rawType = view.getUint32(reader.offset, littleEndian);
    reader.offset += 4;

    const type = rawType % 1000;
    const flags = Math.floor(rawType / 1000);

    let count = 0;
    if (type > 1 && type <= 7) {
      count = view.getUint32(reader.offset, littleEndian);
      reader.offset += 4;
    }

    // XY, XYZ, XYM, XYZM
    let dim = 2;
    if (flags) dim++;
    if (flags === 3) dim++;

    return { littleEndian, type, dim, count }
  }

  /**
   * @param {DataReader} reader
   * @param {WkbFlags} flags
   * @returns {number[]}
   */
  function readPosition(reader, flags) {
    const points = [];
    for (let i = 0; i < flags.dim; i++) {
      const coord = reader.view.getFloat64(reader.offset, flags.littleEndian);
      reader.offset += 8;
      points.push(coord);
    }
    return points
  }

  /**
   * @param {DataReader} reader
   * @param {WkbFlags} flags
   * @returns {number[][]}
   */
  function readLine(reader, flags) {
    const points = [];
    for (let i = 0; i < flags.count; i++) {
      points.push(readPosition(reader, flags));
    }
    return points
  }

  /**
   * @param {DataReader} reader
   * @param {WkbFlags} flags
   * @returns {number[][][]}
   */
  function readPolygon(reader, flags) {
    const { view } = reader;
    const rings = [];
    for (let r = 0; r < flags.count; r++) {
      const count = view.getUint32(reader.offset, flags.littleEndian);
      reader.offset += 4;
      rings.push(readLine(reader, { ...flags, count }));
    }
    return rings
  }

  /**
   * @typedef {object} WkbFlags
   * @property {boolean} littleEndian
   * @property {number} type
   * @property {number} dim
   * @property {number} count
   */

  /**
   * @import {DataReader, Geometry} from '../src/types.js'
   */

  /**
   * @import {ColumnDecoder, DecodedArray, Encoding, ParquetParsers} from '../src/types.js'
   */

  const decoder$2 = new TextDecoder();

  /**
   * Default type parsers when no custom ones are given
   * @type ParquetParsers
   */
  const DEFAULT_PARSERS = {
    timestampFromMilliseconds(millis) {
      return new Date(Number(millis))
    },
    timestampFromMicroseconds(micros) {
      return new Date(Number(micros / 1000n))
    },
    timestampFromNanoseconds(nanos) {
      return new Date(Number(nanos / 1000000n))
    },
    dateFromDays(days) {
      return new Date(days * 86400000)
    },
    stringFromBytes(bytes) {
      return bytes && decoder$2.decode(bytes)
    },
    geometryFromBytes(bytes) {
      return bytes && wkbToGeojson({ view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), offset: 0 })
    },
    geographyFromBytes(bytes) {
      return bytes && wkbToGeojson({ view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), offset: 0 })
    },
    uuidFromBytes(bytes) {
      if (!bytes) return undefined
      const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20, 32)
    },
  };

  /**
   * Convert known types from primitive to rich, and dereference dictionary.
   *
   * @param {DecodedArray} data series of primitive types
   * @param {DecodedArray | undefined} dictionary
   * @param {Encoding} encoding
   * @param {ColumnDecoder} columnDecoder
   * @returns {DecodedArray} series of rich types
   */
  function convertWithDictionary(data, dictionary, encoding, columnDecoder) {
    if (dictionary && encoding.endsWith('_DICTIONARY')) {
      let output = data;
      if (data instanceof Uint8Array && !(dictionary instanceof Uint8Array)) {
        // @ts-expect-error upgrade data to match dictionary type with fancy constructor
        output = new dictionary.constructor(data.length);
      }
      for (let i = 0; i < data.length; i++) {
        output[i] = dictionary[data[i]];
      }
      return output
    } else {
      return convert(data, columnDecoder)
    }
  }

  /**
   * Convert known types from primitive to rich.
   *
   * @param {DecodedArray} data series of primitive types
   * @param {ColumnDecoder} columnDecoder
   * @returns {DecodedArray} series of rich types
   */
  function convert(data, columnDecoder) {
    const { element, parsers, utf8 = true, schemaPath } = columnDecoder;
    const { type, converted_type: ctype, logical_type: ltype } = element;
    const nullable = element.repetition_type !== 'REQUIRED';

    // Skip utf8 conversion for plain BYTE_ARRAY inside VARIANT
    const isVariant = schemaPath?.some(s => s.element.logical_type?.type === 'VARIANT');
    if (isVariant && type === 'BYTE_ARRAY' && ctype !== 'UTF8' && ltype?.type !== 'STRING') {
      return data
    }
    if (ctype === 'DECIMAL') {
      const scale = element.scale || 0;
      const factor = 10 ** -scale;
      const arr = new Array(data.length);
      for (let i = 0; i < arr.length; i++) {
        if (data[i] instanceof Uint8Array) {
          arr[i] = parseDecimal(data[i]) * factor;
        } else {
          arr[i] = Number(data[i]) * factor;
        }
      }
      return arr
    }
    if (!ctype && type === 'INT96') {
      return Array.from(data).map(v => parsers.timestampFromNanoseconds(parseInt96Nanos(v)))
    }
    if (ctype === 'DATE') {
      return Array.from(data).map(v => parsers.dateFromDays(v))
    }
    if (ctype === 'TIMESTAMP_MILLIS') {
      return Array.from(data).map(v => parsers.timestampFromMilliseconds(v))
    }
    if (ctype === 'TIMESTAMP_MICROS') {
      return Array.from(data).map(v => parsers.timestampFromMicroseconds(v))
    }
    if (ctype === 'JSON') {
      return data.map(v => JSON.parse(decoder$2.decode(v)))
    }
    if (ctype === 'BSON') {
      throw new Error('parquet bson not supported')
    }
    if (ctype === 'INTERVAL') {
      throw new Error('parquet interval not supported')
    }
    if (ltype?.type === 'GEOMETRY') {
      return data.map(v => parsers.geometryFromBytes(v))
    }
    if (ltype?.type === 'GEOGRAPHY') {
      return data.map(v => parsers.geographyFromBytes(v))
    }
    if (ltype?.type === 'UUID') {
      return data.map(v => parsers.uuidFromBytes(v))
    }
    if (ctype === 'UTF8' || ltype?.type === 'STRING' || utf8 && type === 'BYTE_ARRAY') {
      return data.map(v => parsers.stringFromBytes(v))
    }
    if (ctype === 'UINT_64' || ltype?.type === 'INTEGER' && ltype.bitWidth === 64 && !ltype.isSigned) {
      if (data instanceof BigInt64Array) return new BigUint64Array(data.buffer, data.byteOffset, data.length)
      const arr = nullable ? new Array(data.length) : new BigUint64Array(data.length);
      for (let i = 0; i < arr.length; i++) arr[i] = data[i];
      return arr
    }
    if (ctype === 'UINT_32' || ltype?.type === 'INTEGER' && ltype.bitWidth === 32 && !ltype.isSigned) {
      if (data instanceof Int32Array) return new Uint32Array(data.buffer, data.byteOffset, data.length)
      const arr = nullable ? new Array(data.length) : new Uint32Array(data.length);
      for (let i = 0; i < arr.length; i++) {
        arr[i] = data[i] < 0 ? 4294967296 + data[i] : data[i];
      }
      return arr
    }
    if (ltype?.type === 'FLOAT16') {
      return Array.from(data).map(parseFloat16)
    }
    if (ltype?.type === 'TIMESTAMP') {
      const { unit } = ltype;
      /** @type {ParquetParsers[keyof ParquetParsers]} */
      let parser = parsers.timestampFromMilliseconds;
      if (unit === 'MICROS') parser = parsers.timestampFromMicroseconds;
      if (unit === 'NANOS') parser = parsers.timestampFromNanoseconds;
      const arr = new Array(data.length);
      for (let i = 0; i < arr.length; i++) {
        arr[i] = parser(data[i]);
      }
      return arr
    }
    return data
  }

  /**
   * @param {Uint8Array} bytes
   * @returns {number}
   */
  function parseDecimal(bytes) {
    if (!bytes.length) return 0

    let value = 0n;
    for (const byte of bytes) {
      value = value * 256n + BigInt(byte);
    }

    // handle signed
    const bits = bytes.length * 8;
    if (value >= 2n ** BigInt(bits - 1)) {
      value -= 2n ** BigInt(bits);
    }

    return Number(value)
  }

  /**
   * Converts INT96 date format (hi 32bit days, lo 64bit nanos) to nanos since epoch
   * @param {bigint} value
   * @returns {bigint}
   */
  function parseInt96Nanos(value) {
    const days = (value >> 64n) - 2440588n;
    const nano = value & 0xffffffffffffffffn;
    return days * 86400000000000n + nano
  }

  /**
   * @param {Uint8Array | undefined} bytes
   * @returns {number | undefined}
   */
  function parseFloat16(bytes) {
    if (!bytes) return undefined
    const int16 = bytes[1] << 8 | bytes[0];
    const sign = int16 >> 15 ? -1 : 1;
    const exp = int16 >> 10 & 0x1f;
    const frac = int16 & 0x3ff;
    if (exp === 0) return sign * 2 ** -14 * (frac / 1024) // subnormals
    if (exp === 0x1f) return frac ? NaN : sign * Infinity
    return sign * 2 ** (exp - 15) * (1 + frac / 1024)
  }

  /**
   * Build a tree from the schema elements.
   *
   * @param {SchemaElement[]} schema
   * @param {number} rootIndex index of the root element
   * @param {string[]} path path to the element
   * @returns {SchemaTree} tree of schema elements
   */
  function schemaTree(schema, rootIndex, path) {
    const element = schema[rootIndex];
    const children = [];
    let count = 1;

    // Read the specified number of children
    if (element.num_children) {
      while (children.length < element.num_children) {
        const childElement = schema[rootIndex + count];
        const child = schemaTree(schema, rootIndex + count, [...path, childElement.name]);
        count += child.count;
        children.push(child);
      }
    }

    return { count, element, children, path }
  }

  /**
   * Get schema elements from the root to the given element name.
   *
   * @param {SchemaElement[]} schema
   * @param {string[]} name path to the element
   * @returns {SchemaTree[]} list of schema elements
   */
  function getSchemaPath(schema, name) {
    let tree = schemaTree(schema, 0, []);
    const path = [tree];
    for (const part of name) {
      const child = tree.children.find(child => child.element.name === part);
      if (!child) throw new Error(`parquet schema element not found: ${name}`)
      path.push(child);
      tree = child;
    }
    return path
  }

  /**
   * Get all physical (leaf) column names.
   *
   * @param {SchemaTree} schemaTree
   * @returns {string[]} list of physical column names
   */
  function getPhysicalColumns(schemaTree) {
    /** @type {string[]} */
    const columns = [];
    /** @param {SchemaTree} node */
    function traverse(node) {
      if (node.children.length) {
        for (const child of node.children) {
          traverse(child);
        }
      } else {
        columns.push(node.path.join('.'));
      }
    }
    traverse(schemaTree);
    return columns
  }

  /**
   * Get the max repetition level for a given schema path.
   *
   * @param {SchemaTree[]} schemaPath
   * @returns {number} max repetition level
   */
  function getMaxRepetitionLevel$1(schemaPath) {
    let maxLevel = 0;
    for (const { element } of schemaPath) {
      if (element.repetition_type === 'REPEATED') {
        maxLevel++;
      }
    }
    return maxLevel
  }

  /**
   * Get the max definition level for a given schema path.
   *
   * @param {SchemaTree[]} schemaPath
   * @returns {number} max definition level
   */
  function getMaxDefinitionLevel(schemaPath) {
    let maxLevel = 0;
    for (const { element } of schemaPath.slice(1)) {
      if (element.repetition_type !== 'REQUIRED') {
        maxLevel++;
      }
    }
    return maxLevel
  }

  /**
   * Check if a column is list-like.
   *
   * @param {SchemaTree} schema
   * @returns {boolean} true if list-like
   */
  function isListLike(schema) {
    if (!schema) return false
    if (schema.element.converted_type !== 'LIST') return false
    if (schema.children.length > 1) return false

    const firstChild = schema.children[0];
    if (firstChild.children.length > 1) return false
    if (firstChild.element.repetition_type !== 'REPEATED') return false

    return true
  }

  /**
   * Check if a column is map-like.
   *
   * @param {SchemaTree} schema
   * @returns {boolean} true if map-like
   */
  function isMapLike(schema) {
    if (!schema) return false
    if (schema.element.converted_type !== 'MAP') return false
    if (schema.children.length > 1) return false

    const firstChild = schema.children[0];
    if (firstChild.children.length !== 2) return false
    if (firstChild.element.repetition_type !== 'REPEATED') return false

    const keyChild = firstChild.children.find(child => child.element.name === 'key');
    if (keyChild?.element.repetition_type === 'REPEATED') return false

    const valueChild = firstChild.children.find(child => child.element.name === 'value');
    if (valueChild?.element.repetition_type === 'REPEATED') return false

    return true
  }

  /**
   * Returns true if a column is non-nested.
   *
   * @param {SchemaTree[]} schemaPath
   * @returns {boolean}
   */
  function isFlatColumn(schemaPath) {
    if (schemaPath.length !== 2) return false
    const [, column] = schemaPath;
    if (column.element.repetition_type === 'REPEATED') return false
    if (column.children.length) return false
    return true
  }

  /**
   * @import {SchemaElement, SchemaTree} from '../src/types.js'
   */

  /**
   * @import {DataReader, ThriftObject, ThriftType} from '../src/types.js'
   */

  // TCompactProtocol types
  const STOP$1 = 0;
  const TRUE$1 = 1;
  const FALSE$1 = 2;
  const BYTE$1 = 3;
  const I16 = 4;
  const I32$1 = 5;
  const I64$1 = 6;
  const DOUBLE$1 = 7;
  const BINARY$1 = 8;
  const LIST$1 = 9;
  const STRUCT$1 = 12;

  /**
   * Parse TCompactProtocol
   *
   * @param {DataReader} reader
   * @returns {{ [key: `field_${number}`]: any }}
   */
  function deserializeTCompactProtocol(reader) {
    /** @type {ThriftObject} */
    const value = {};
    let fid = 0;

    while (reader.offset < reader.view.byteLength) {
      // Parse each field based on its type and add to the result object
      const byte = reader.view.getUint8(reader.offset++);
      const type = byte & 0x0f;
      if (type === STOP$1) break
      const delta = byte >> 4;
      fid = delta ? fid + delta : readZigZag(reader);
      value[`field_${fid}`] = readElement(reader, type);
    }

    return value
  }

  /**
   * Read a single element based on its type
   *
   * @param {DataReader} reader
   * @param {number} type
   * @returns {ThriftType}
   */
  function readElement(reader, type) {
    switch (type) {
    case TRUE$1:
      return true
    case FALSE$1:
      return false
    case BYTE$1:
      return reader.view.getInt8(reader.offset++)
    case I16:
    case I32$1:
      return readZigZag(reader)
    case I64$1:
      return readZigZagBigInt(reader)
    case DOUBLE$1: {
      const value = reader.view.getFloat64(reader.offset, true);
      reader.offset += 8;
      return value
    }
    case BINARY$1: {
      const stringLength = readVarInt(reader);
      const strBytes = new Uint8Array(reader.view.buffer, reader.view.byteOffset + reader.offset, stringLength);
      reader.offset += stringLength;
      return strBytes
    }
    case LIST$1: {
      const byte = reader.view.getUint8(reader.offset++);
      const elemType = byte & 0x0f;
      let listSize = byte >> 4;
      if (listSize === 15) {
        listSize = readVarInt(reader);
      }
      const boolType = elemType === TRUE$1 || elemType === FALSE$1;
      const values = new Array(listSize);
      for (let i = 0; i < listSize; i++) {
        values[i] = boolType ? readElement(reader, BYTE$1) === 1 : readElement(reader, elemType);
      }
      return values
    }
    case STRUCT$1:
      // main function handles struct parsing
      return deserializeTCompactProtocol(reader)
    default:
      // MAP, SET, UUID not used by parquet
      throw new Error(`thrift unhandled type: ${type}`)
    }
  }

  /**
   * Read varint aka Unsigned LEB128.
   *
   * @param {DataReader} reader
   * @returns {number}
   */
  function readVarInt(reader) {
    let result = 0;
    let shift = 0;
    while (true) {
      // Read groups of 7 low bits until high bit is 0
      const byte = reader.view.getUint8(reader.offset++);
      result |= (byte & 0x7f) << shift;
      if (!(byte & 0x80)) {
        return result
      }
      shift += 7;
    }
  }

  /**
   * Read a varint as a bigint.
   *
   * @param {DataReader} reader
   * @returns {bigint}
   */
  function readVarBigInt(reader) {
    let result = 0n;
    let shift = 0n;
    while (true) {
      const byte = reader.view.getUint8(reader.offset++);
      result |= BigInt(byte & 0x7f) << shift;
      if (!(byte & 0x80)) {
        return result
      }
      shift += 7n;
    }
  }

  /**
   * Read a zigzag number.
   * Zigzag folds positive and negative numbers into the positive number space.
   *
   * @param {DataReader} reader
   * @returns {number}
   */
  function readZigZag(reader) {
    const zigzag = readVarInt(reader);
    return zigzag >>> 1 ^ -(zigzag & 1)
  }

  /**
   * Read a zigzag bigint.
   *
   * @param {DataReader} reader
   * @returns {bigint}
   */
  function readZigZagBigInt(reader) {
    const zigzag = readVarBigInt(reader);
    return zigzag >> 1n ^ -(zigzag & 1n)
  }

  /**
   * @param {SchemaElement[]} schema
   * @param {KeyValue[] | undefined} key_value_metadata
   * @returns {void}
   */
  function markGeoColumns(schema, key_value_metadata) {
    // Prepare the list of GeoParquet columns
    /** @type {Map<string, LogicalType>} */
    const columns = new Map();
    const geo = key_value_metadata?.find(({ key }) => key === 'geo')?.value;
    const decodedColumns = (geo && JSON.parse(geo)?.columns) ?? {};
    for (const [name, column] of Object.entries(decodedColumns)) {
      if (column.encoding !== 'WKB') continue

      const type = column.edges === 'spherical' ? 'GEOGRAPHY' : 'GEOMETRY';
      const id = column.crs?.id ?? column.crs?.ids?.[0];
      const crs = id ? `${id.authority}:${id.code.toString()}` : undefined;
      // Note: we can't infer GEOGRAPHY's algorithm from GeoParquet
      columns.set(name, { type, crs });
    }

    // Mark schema elements with logical type
    // Only look at root-level columns of type BYTE_ARRAY without existing logical_type
    for (let i = 1; i < schema.length; i++) { // skip root
      const { logical_type, name, num_children, type } = schema[i];
      if (num_children) {
        i += num_children;
        continue // skip the element and its children
      }
      if (type === 'BYTE_ARRAY' && !logical_type) {
        schema[i].logical_type = columns.get(name);
      }
    }
  }

  /**
   * @import {KeyValue, LogicalType, SchemaElement} from '../src/types.js'
   */

  /**
   * @import {AsyncBuffer, FileMetaData, KeyValue, LogicalType, MetadataOptions, MinMaxType, ParquetParsers, SchemaElement, SchemaTree, Statistics, TimeUnit} from '../src/types.js'
   */

  const defaultInitialFetchSize = 1 << 19; // 512kb

  const decoder$1 = new TextDecoder();
  function decode(/** @type {Uint8Array} */ value) {
    return value && decoder$1.decode(value)
  }

  /**
   * Read parquet metadata from an async buffer.
   *
   * An AsyncBuffer is like an ArrayBuffer, but the slices are loaded
   * asynchronously, possibly over the network.
   *
   * You must provide the byteLength of the buffer, typically from a HEAD request.
   *
   * In theory, you could use suffix-range requests to fetch the end of the file,
   * and save a round trip. But in practice, this doesn't work because chrome
   * deems suffix-range requests as a not-safe-listed header, and will require
   * a pre-flight. So the byteLength is required.
   *
   * To make this efficient, we initially request the last 512kb of the file,
   * which is likely to contain the metadata. If the metadata length exceeds the
   * initial fetch, 512kb, we request the rest of the metadata from the AsyncBuffer.
   *
   * This ensures that we either make one 512kb initial request for the metadata,
   * or a second request for up to the metadata size.
   *
   * @param {AsyncBuffer} asyncBuffer parquet file contents
   * @param {MetadataOptions & { initialFetchSize?: number }} options initial fetch size in bytes (default 512kb)
   * @returns {Promise<FileMetaData>} parquet metadata object
   */
  async function parquetMetadataAsync(asyncBuffer, { parsers, initialFetchSize = defaultInitialFetchSize, geoparquet = true } = {}) {
    if (!asyncBuffer || !(asyncBuffer.byteLength >= 0)) throw new Error('parquet expected AsyncBuffer')

    // fetch last bytes (footer) of the file
    const footerOffset = Math.max(0, asyncBuffer.byteLength - initialFetchSize);
    const footerBuffer = await asyncBuffer.slice(footerOffset, asyncBuffer.byteLength);

    // Check for parquet magic number "PAR1"
    const footerView = new DataView(footerBuffer);
    if (footerView.getUint32(footerBuffer.byteLength - 4, true) !== 0x31524150) {
      throw new Error('parquet file invalid (footer != PAR1)')
    }

    // Parquet files store metadata at the end of the file
    // Metadata length is 4 bytes before the last PAR1
    const metadataLength = footerView.getUint32(footerBuffer.byteLength - 8, true);
    if (metadataLength > asyncBuffer.byteLength - 8) {
      throw new Error(`parquet metadata length ${metadataLength} exceeds available buffer ${asyncBuffer.byteLength - 8}`)
    }

    // check if metadata size fits inside the initial fetch
    if (metadataLength + 8 > initialFetchSize) {
      // fetch the rest of the metadata
      const metadataOffset = asyncBuffer.byteLength - metadataLength - 8;
      const metadataBuffer = await asyncBuffer.slice(metadataOffset, footerOffset);
      // combine initial fetch with the new slice
      const combinedBuffer = new ArrayBuffer(metadataLength + 8);
      const combinedView = new Uint8Array(combinedBuffer);
      combinedView.set(new Uint8Array(metadataBuffer));
      combinedView.set(new Uint8Array(footerBuffer), footerOffset - metadataOffset);
      return parquetMetadata(combinedBuffer, { parsers, geoparquet })
    } else {
      // parse metadata from the footer
      return parquetMetadata(footerBuffer, { parsers, geoparquet })
    }
  }

  /**
   * Read parquet metadata from a buffer synchronously.
   *
   * @param {ArrayBuffer} arrayBuffer parquet file footer
   * @param {MetadataOptions} options metadata parsing options
   * @returns {FileMetaData} parquet metadata object
   */
  function parquetMetadata(arrayBuffer, { parsers, geoparquet = true } = {}) {
    if (!(arrayBuffer instanceof ArrayBuffer)) throw new Error('parquet expected ArrayBuffer')
    const view = new DataView(arrayBuffer);

    // Use default parsers if not given
    parsers = { ...DEFAULT_PARSERS, ...parsers };

    // Validate footer magic number "PAR1"
    if (view.byteLength < 8) {
      throw new Error('parquet file is too short')
    }
    if (view.getUint32(view.byteLength - 4, true) !== 0x31524150) {
      throw new Error('parquet file invalid (footer != PAR1)')
    }

    // Parquet files store metadata at the end of the file
    // Metadata length is 4 bytes before the last PAR1
    const metadataLengthOffset = view.byteLength - 8;
    const metadataLength = view.getUint32(metadataLengthOffset, true);
    if (metadataLength > view.byteLength - 8) {
      // {metadata}, metadata_length, PAR1
      throw new Error(`parquet metadata length ${metadataLength} exceeds available buffer ${view.byteLength - 8}`)
    }

    const metadataOffset = metadataLengthOffset - metadataLength;
    const reader = { view, offset: metadataOffset };
    const metadata = deserializeTCompactProtocol(reader);

    // Parse metadata from thrift data
    const version = metadata.field_1;
    /** @type {SchemaElement[]} */
    const schema = metadata.field_2.map((/** @type {any} */ field) => ({
      type: ParquetTypes[field.field_1],
      type_length: field.field_2,
      repetition_type: FieldRepetitionTypes[field.field_3],
      name: decode(field.field_4),
      num_children: field.field_5,
      converted_type: ConvertedTypes[field.field_6],
      scale: field.field_7,
      precision: field.field_8,
      field_id: field.field_9,
      logical_type: logicalType$1(field.field_10),
    }));
    // schema element per column index
    const columnSchema = schema.filter(e => e.type);
    const num_rows = metadata.field_3;
    const row_groups = metadata.field_4.map((/** @type {any} */ rowGroup) => ({
      columns: rowGroup.field_1.map((/** @type {any} */ column, /** @type {number} */ columnIndex) => ({
        file_path: decode(column.field_1),
        file_offset: column.field_2,
        meta_data: column.field_3 && {
          type: ParquetTypes[column.field_3.field_1],
          encodings: column.field_3.field_2?.map((/** @type {number} */ e) => Encodings[e]),
          path_in_schema: column.field_3.field_3.map(decode),
          codec: CompressionCodecs[column.field_3.field_4],
          num_values: column.field_3.field_5,
          total_uncompressed_size: column.field_3.field_6,
          total_compressed_size: column.field_3.field_7,
          key_value_metadata: column.field_3.field_8?.map((/** @type {any} */ kv) => ({
            key: decode(kv.field_1),
            value: decode(kv.field_2),
          })),
          data_page_offset: column.field_3.field_9,
          index_page_offset: column.field_3.field_10,
          dictionary_page_offset: column.field_3.field_11,
          statistics: convertStats(column.field_3.field_12, columnSchema[columnIndex], parsers),
          encoding_stats: column.field_3.field_13?.map((/** @type {any} */ encodingStat) => ({
            page_type: PageTypes[encodingStat.field_1],
            encoding: Encodings[encodingStat.field_2],
            count: encodingStat.field_3,
          })),
          bloom_filter_offset: column.field_3.field_14,
          bloom_filter_length: column.field_3.field_15,
          size_statistics: column.field_3.field_16 && {
            unencoded_byte_array_data_bytes: column.field_3.field_16.field_1,
            repetition_level_histogram: column.field_3.field_16.field_2,
            definition_level_histogram: column.field_3.field_16.field_3,
          },
          geospatial_statistics: column.field_3.field_17 && {
            bbox: column.field_3.field_17.field_1 && {
              xmin: column.field_3.field_17.field_1.field_1,
              xmax: column.field_3.field_17.field_1.field_2,
              ymin: column.field_3.field_17.field_1.field_3,
              ymax: column.field_3.field_17.field_1.field_4,
              zmin: column.field_3.field_17.field_1.field_5,
              zmax: column.field_3.field_17.field_1.field_6,
              mmin: column.field_3.field_17.field_1.field_7,
              mmax: column.field_3.field_17.field_1.field_8,
            },
            geospatial_types: column.field_3.field_17.field_2,
          },
        },
        offset_index_offset: column.field_4,
        offset_index_length: column.field_5,
        column_index_offset: column.field_6,
        column_index_length: column.field_7,
        crypto_metadata: column.field_8,
        encrypted_column_metadata: column.field_9,
      })),
      total_byte_size: rowGroup.field_2,
      num_rows: rowGroup.field_3,
      sorting_columns: rowGroup.field_4?.map((/** @type {any} */ sortingColumn) => ({
        column_idx: sortingColumn.field_1,
        descending: sortingColumn.field_2,
        nulls_first: sortingColumn.field_3,
      })),
      file_offset: rowGroup.field_5,
      total_compressed_size: rowGroup.field_6,
      ordinal: rowGroup.field_7,
    }));
    /** @type {KeyValue[] | undefined} */
    const key_value_metadata = metadata.field_5?.map((/** @type {any} */ kv) => ({
      key: decode(kv.field_1),
      value: decode(kv.field_2),
    }));
    const created_by = decode(metadata.field_6);

    if (geoparquet) {
      markGeoColumns(schema, key_value_metadata);
    }

    return {
      version,
      schema,
      num_rows,
      row_groups,
      key_value_metadata,
      created_by,
      metadata_length: metadataLength,
    }
  }

  /**
   * Return a tree of schema elements from parquet metadata.
   *
   * @param {{schema: SchemaElement[]}} metadata parquet metadata object
   * @returns {SchemaTree} tree of schema elements
   */
  function parquetSchema({ schema }) {
    return getSchemaPath(schema, [])[0]
  }

  /**
   * @param {any} logicalType
   * @returns {LogicalType | undefined}
   */
  function logicalType$1(logicalType) {
    if (logicalType?.field_1) return { type: 'STRING' }
    if (logicalType?.field_2) return { type: 'MAP' }
    if (logicalType?.field_3) return { type: 'LIST' }
    if (logicalType?.field_4) return { type: 'ENUM' }
    if (logicalType?.field_5) return {
      type: 'DECIMAL',
      scale: logicalType.field_5.field_1,
      precision: logicalType.field_5.field_2,
    }
    if (logicalType?.field_6) return { type: 'DATE' }
    if (logicalType?.field_7) return {
      type: 'TIME',
      isAdjustedToUTC: logicalType.field_7.field_1,
      unit: timeUnit$1(logicalType.field_7.field_2),
    }
    if (logicalType?.field_8) return {
      type: 'TIMESTAMP',
      isAdjustedToUTC: logicalType.field_8.field_1,
      unit: timeUnit$1(logicalType.field_8.field_2),
    }
    if (logicalType?.field_10) return {
      type: 'INTEGER',
      bitWidth: logicalType.field_10.field_1,
      isSigned: logicalType.field_10.field_2,
    }
    if (logicalType?.field_11) return { type: 'NULL' }
    if (logicalType?.field_12) return { type: 'JSON' }
    if (logicalType?.field_13) return { type: 'BSON' }
    if (logicalType?.field_14) return { type: 'UUID' }
    if (logicalType?.field_15) return { type: 'FLOAT16' }
    if (logicalType?.field_16) return {
      type: 'VARIANT',
      specification_version: logicalType.field_16.field_1,
    }
    if (logicalType?.field_17) return {
      type: 'GEOMETRY',
      crs: decode(logicalType.field_17.field_1),
    }
    if (logicalType?.field_18) return {
      type: 'GEOGRAPHY',
      crs: decode(logicalType.field_18.field_1),
      algorithm: EdgeInterpolationAlgorithms[logicalType.field_18.field_2],
    }
    return logicalType
  }

  /**
   * @param {any} unit
   * @returns {TimeUnit}
   */
  function timeUnit$1(unit) {
    if (unit.field_1) return 'MILLIS'
    if (unit.field_2) return 'MICROS'
    if (unit.field_3) return 'NANOS'
    throw new Error('parquet time unit required')
  }

  /**
   * Convert column statistics based on column type.
   *
   * @param {any} stats
   * @param {SchemaElement} schema
   * @param {ParquetParsers} parsers
   * @returns {Statistics}
   */
  function convertStats(stats, schema, parsers) {
    return stats && {
      max: convertMetadata(stats.field_1, schema, parsers),
      min: convertMetadata(stats.field_2, schema, parsers),
      null_count: stats.field_3,
      distinct_count: stats.field_4,
      max_value: convertMetadata(stats.field_5, schema, parsers),
      min_value: convertMetadata(stats.field_6, schema, parsers),
      is_max_value_exact: stats.field_7,
      is_min_value_exact: stats.field_8,
    }
  }

  /**
   * @param {Uint8Array | undefined} value
   * @param {SchemaElement} schema
   * @param {ParquetParsers} parsers
   * @returns {MinMaxType | undefined}
   */
  function convertMetadata(value, schema, parsers) {
    const { type, converted_type, logical_type } = schema;
    if (value === undefined) return value
    if (type === 'BOOLEAN') return value[0] === 1
    if (type === 'BYTE_ARRAY') return parsers.stringFromBytes(value)
    const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
    if (type === 'FLOAT' && view.byteLength === 4) return view.getFloat32(0, true)
    if (type === 'DOUBLE' && view.byteLength === 8) return view.getFloat64(0, true)
    if (type === 'INT32' && converted_type === 'DATE') return parsers.dateFromDays(view.getInt32(0, true))
    if (type === 'INT64' && converted_type === 'TIMESTAMP_MILLIS') return parsers.timestampFromMilliseconds(view.getBigInt64(0, true))
    if (type === 'INT64' && converted_type === 'TIMESTAMP_MICROS') return parsers.timestampFromMicroseconds(view.getBigInt64(0, true))
    if (type === 'INT64' && logical_type?.type === 'TIMESTAMP' && logical_type?.unit === 'NANOS') return parsers.timestampFromNanoseconds(view.getBigInt64(0, true))
    if (type === 'INT64' && logical_type?.type === 'TIMESTAMP' && logical_type?.unit === 'MICROS') return parsers.timestampFromMicroseconds(view.getBigInt64(0, true))
    if (type === 'INT64' && logical_type?.type === 'TIMESTAMP') return parsers.timestampFromMilliseconds(view.getBigInt64(0, true))
    if (type === 'INT32' && view.byteLength === 4) return view.getInt32(0, true)
    if (type === 'INT64' && view.byteLength === 8) return view.getBigInt64(0, true)
    if (converted_type === 'DECIMAL') return parseDecimal(value) * 10 ** -(schema.scale || 0)
    if (logical_type?.type === 'FLOAT16') return parseFloat16(value)
    if (type === 'FIXED_LEN_BYTE_ARRAY') return value
    // assert(false)
    return value
  }

  /**
   * @import {ColumnIndex, DataReader, OffsetIndex, PageLocation, ParquetParsers, SchemaElement} from '../src/types.js'
   */


  /**
   * @param {DataReader} reader
   * @param {SchemaElement} schema
   * @param {ParquetParsers | undefined} parsers
   * @returns {ColumnIndex}
   */
  function readColumnIndex(reader, schema, parsers = undefined) {
    parsers = { ...DEFAULT_PARSERS, ...parsers };

    const thrift = deserializeTCompactProtocol(reader);
    return {
      null_pages: thrift.field_1,
      min_values: thrift.field_2.map((/** @type {any} */ m) => convertMetadata(m, schema, parsers)),
      max_values: thrift.field_3.map((/** @type {any} */ m) => convertMetadata(m, schema, parsers)),
      boundary_order: BoundaryOrders[thrift.field_4],
      null_counts: thrift.field_5,
      repetition_level_histograms: thrift.field_6,
      definition_level_histograms: thrift.field_7,
    }
  }

  /**
   * @param {DataReader} reader
   * @returns {OffsetIndex}
   */
  function readOffsetIndex(reader) {
    const thrift = deserializeTCompactProtocol(reader);
    return {
      // @ts-ignore
      page_locations: thrift.field_1.map(loc => ({
        offset: loc.field_1,
        compressed_page_size: loc.field_2,
        first_row_index: loc.field_3,
      })),
      unencoded_byte_array_data_bytes: thrift.field_2,
    }
  }

  /**
   * @import {AsyncBuffer, Awaitable, DecodedArray} from '../src/types.js'
   */


  /**
   * Replace bigint, date, etc with legal JSON types.
   *
   * @param {any} obj object to convert
   * @returns {unknown} converted object
   */
  function toJson(obj) {
    if (obj === undefined) return null
    if (typeof obj === 'bigint') return Number(obj)
    if (Object.is(obj, -0)) return 0
    if (Array.isArray(obj)) return obj.map(toJson)
    if (obj instanceof Uint8Array) return Array.from(obj)
    if (obj instanceof Date) return obj.toISOString()
    if (obj instanceof Object) {
      /** @type {Record<string, unknown>} */
      const newObj = {};
      for (const key of Object.keys(obj)) {
        if (obj[key] === undefined) continue
        newObj[key] = toJson(obj[key]);
      }
      return newObj
    }
    return obj
  }

  /**
   * Concatenate two arrays fast.
   *
   * @param {any[]} aaa
   * @param {DecodedArray} bbb
   */
  function concat(aaa, bbb) {
    const chunk = 10000;
    for (let i = 0; i < bbb.length; i += chunk) {
      aaa.push(...bbb.slice(i, i + chunk));
    }
  }

  /**
   * Deep equality.
   *
   * @param {any} a
   * @param {any} b
   * @param {boolean} [strict]
   * @returns {boolean}
   */
  function equals(a, b, strict = true) {
    // eslint-disable-next-line eqeqeq
    if (strict ? a === b : a == b) return true
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false

    if (a instanceof Uint8Array && b instanceof Uint8Array) {
      if (a.length !== b.length) return false
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
      }
      return true
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false
      for (let i = 0; i < a.length; i++) {
        if (!equals(a[i], b[i], strict)) return false
      }
      return true
    }

    const aKeys = Object.keys(a);
    if (aKeys.length !== Object.keys(b).length) return false
    for (const k of aKeys) {
      if (!equals(a[k], b[k], strict)) return false
    }
    return true
  }

  /**
   * Get the byte length using fetch with a ranged GET request.
   * Aborts the request if server returns 200 instead of 206.
   *
   * @param {string} url
   * @param {RequestInit} [requestInit] fetch options
   * @param {typeof globalThis.fetch} [fetchFn] fetch function to use
   * @returns {Promise<number>}
   */
  async function byteLengthFromUrlUsingGet(url, requestInit = {}, fetchFn = globalThis.fetch) {
    const controller = new AbortController();
    const headers = new Headers(requestInit.headers);
    headers.set('Range', 'bytes=0-0');

    const res = await fetchFn(url, {
      ...requestInit,
      headers,
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`fetch with range failed ${res.status}`)

    // Server supports Range requests (206 Partial Content)
    if (res.status === 206) {
      const contentRange = res.headers.get('Content-Range');
      if (!contentRange) throw new Error('missing content-range header')

      // Parse "bytes 0-0/9446073" to get total length
      const match = contentRange.match(/bytes \d+-\d+\/(\d+)/);
      if (!match) throw new Error(`invalid content-range header: ${contentRange}`)

      return parseInt(match[1])
    }

    // Server ignored Range and returned 200 - get Content-Length and abort request
    if (res.status === 200) {
      const contentLength = res.headers.get('Content-Length');

      // Abort the request to stop any ongoing download
      controller.abort();

      if (contentLength) return parseInt(contentLength)
    }

    throw new Error('server does not support range requests and missing content-length')
  }

  /**
   * Get the byte length of a URL using a HEAD request.
   * If HEAD fails with 403 (e.g., with signed S3 URLs), falls back to a ranged GET request.
   * If HEAD succeeds but Content-Length is missing, falls back to GET with range.
   * If requestInit is provided, it will be passed to fetch.
   *
   * @param {string} url
   * @param {RequestInit} [requestInit] fetch options
   * @param {typeof globalThis.fetch} [customFetch] fetch function to use
   * @returns {Promise<number>}
   */
  async function byteLengthFromUrl(url, requestInit, customFetch) {
    const fetch = customFetch ?? globalThis.fetch;
    const res = await fetch(url, { ...requestInit, method: 'HEAD' });

    // If HEAD request is forbidden (common with signed S3 URLs), try GET with range
    if (res.status === 403) {
      return byteLengthFromUrlUsingGet(url, requestInit, fetch)
    }

    if (!res.ok) throw new Error(`fetch head failed ${res.status}`)
    const length = res.headers.get('Content-Length');
    // If Content-Length is missing from HEAD, fallback to GET with range
    if (!length) {
      return byteLengthFromUrlUsingGet(url, requestInit, fetch)
    }
    return parseInt(length)
  }

  /**
   * Construct an AsyncBuffer for a URL.
   * If byteLength is not provided, will make a HEAD request to get the file size.
   * If fetch is provided, it will be used instead of the global fetch.
   * If requestInit is provided, it will be passed to fetch.
   *
   * @param {object} options
   * @param {string} options.url
   * @param {number} [options.byteLength]
   * @param {typeof globalThis.fetch} [options.fetch] fetch function to use
   * @param {RequestInit} [options.requestInit]
   * @returns {Promise<AsyncBuffer>}
   */
  async function asyncBufferFromUrl({ url, byteLength, requestInit, fetch: customFetch }) {
    if (!url) throw new Error('missing url')
    const fetch = customFetch ?? globalThis.fetch;
    // byte length from HEAD request
    byteLength ??= await byteLengthFromUrl(url, requestInit, fetch);

    /**
     * A promise for the whole buffer, if range requests are not supported.
     * @type {Promise<ArrayBuffer>|undefined}
     */
    let buffer = undefined;
    const init = requestInit || {};

    return {
      byteLength,
      async slice(start, end) {
        if (buffer) {
          return buffer.then(buffer => buffer.slice(start, end))
        }

        const headers = new Headers(init.headers);
        const endStr = end === undefined ? '' : end - 1;
        headers.set('Range', `bytes=${start}-${endStr}`);

        const res = await fetch(url, { ...init, headers });
        if (!res.ok || !res.body) throw new Error(`fetch failed ${res.status}`)

        if (res.status === 200) {
          // Endpoint does not support range requests and returned the whole object
          buffer = res.arrayBuffer();
          return buffer.then(buffer => buffer.slice(start, end))
        } else if (res.status === 206) {
          // The endpoint supports range requests and sent us the requested range
          return res.arrayBuffer()
        } else {
          throw new Error(`fetch received unexpected status code ${res.status}`)
        }
      },
    }
  }

  /**
   * Returns a cached layer on top of an AsyncBuffer. For caching slices of a file
   * that are read multiple times, possibly over a network.
   *
   * @param {AsyncBuffer} file file-like object to cache
   * @param {{ minSize?: number }} [options]
   * @returns {AsyncBuffer} cached file-like object
   */
  function cachedAsyncBuffer({ byteLength, slice }, { minSize = defaultInitialFetchSize } = {}) {
    if (byteLength < minSize) {
      // Cache whole file if it's small
      const buffer = slice(0, byteLength);
      return {
        byteLength,
        async slice(start, end) {
          return (await buffer).slice(start, end)
        },
      }
    }
    const cache = new Map();
    return {
      byteLength,
      /**
       * @param {number} start
       * @param {number} [end]
       * @returns {Awaitable<ArrayBuffer>}
       */
      slice(start, end) {
        const key = cacheKey(start, end, byteLength);
        const cached = cache.get(key);
        if (cached) return cached
        // cache miss, read from file
        const promise = slice(start, end);
        cache.set(key, promise);
        return promise
      },
    }
  }


  /**
   * Returns canonical cache key for a byte range 'start,end'.
   * Normalize int-range and suffix-range requests to the same key.
   *
   * @param {number} start start byte of range
   * @param {number} [end] end byte of range, or undefined for suffix range
   * @param {number} [size] size of file, or undefined for suffix range
   * @returns {string}
   */
  function cacheKey(start, end, size) {
    if (start < 0) {
      if (end !== undefined) throw new Error(`invalid suffix range [${start}, ${end}]`)
      if (size === undefined) return `${start},`
      return `${size + start},${size}`
    } else if (end !== undefined) {
      if (start > end) throw new Error(`invalid empty range [${start}, ${end}]`)
      return `${start},${end}`
    } else if (size === undefined) {
      return `${start},`
    } else {
      return `${start},${size}`
    }
  }

  /**
   * Flatten a list of lists into a single list.
   *
   * @param {DecodedArray[]} [chunks]
   * @returns {DecodedArray}
   */
  function flatten(chunks) {
    if (!chunks) return []
    if (chunks.length === 1) return chunks[0]
    /** @type {any[]} */
    const output = [];
    for (const chunk of chunks) {
      concat(output, chunk);
    }
    return output
  }

  /**
   * @import {ParquetQueryFilter, RowGroup} from '../src/types.js'
   */


  /**
   * Returns an array of top-level column names needed to evaluate the filter.
   *
   * @param {ParquetQueryFilter} [filter]
   * @returns {string[]}
   */
  function columnsNeededForFilter(filter) {
    if (!filter) return []
    /** @type {string[]} */
    const columns = [];
    if ('$and' in filter && Array.isArray(filter.$and)) {
      columns.push(...filter.$and.flatMap(columnsNeededForFilter));
    } else if ('$or' in filter && Array.isArray(filter.$or)) {
      columns.push(...filter.$or.flatMap(columnsNeededForFilter));
    } else if ('$nor' in filter && Array.isArray(filter.$nor)) {
      columns.push(...filter.$nor.flatMap(columnsNeededForFilter));
    } else {
      // Map dot-notation paths to top-level column names
      columns.push(...Object.keys(filter).map(key => key.split('.')[0]));
    }
    return [...new Set(columns)]
  }

  /**
   * Match a record against a query filter
   *
   * @param {Record<string, any>} record
   * @param {ParquetQueryFilter} filter
   * @param {boolean} [strict]
   * @returns {boolean}
   */
  function matchFilter(record, filter, strict = true) {
    if ('$and' in filter && Array.isArray(filter.$and)) {
      return filter.$and.every(subQuery => matchFilter(record, subQuery, strict))
    }
    if ('$or' in filter && Array.isArray(filter.$or)) {
      return filter.$or.some(subQuery => matchFilter(record, subQuery, strict))
    }
    if ('$nor' in filter && Array.isArray(filter.$nor)) {
      return !filter.$nor.some(subQuery => matchFilter(record, subQuery, strict))
    }

    return Object.entries(filter).every(([field, condition]) => {
      const value = resolve(record, field);

      // implicit $eq for non-object conditions
      if (typeof condition !== 'object' || condition === null || Array.isArray(condition)) {
        return equals(value, condition, strict)
      }

      return Object.entries(condition || {}).every(([operator, target]) => {
        if (operator === '$gt') return value > target
        if (operator === '$gte') return value >= target
        if (operator === '$lt') return value < target
        if (operator === '$lte') return value <= target
        if (operator === '$eq') return equals(value, target, strict)
        if (operator === '$ne') return !equals(value, target, strict)
        if (operator === '$in') return Array.isArray(target) && target.includes(value)
        if (operator === '$nin') return Array.isArray(target) && !target.includes(value)
        if (operator === '$not') return !matchFilter({ [field]: value }, { [field]: target }, strict)
        return true
      })
    })
  }

  /**
   * Check if a row group can be skipped based on filter and column statistics.
   *
   * @param {object} options
   * @param {RowGroup} options.rowGroup
   * @param {string[]} options.physicalColumns
   * @param {ParquetQueryFilter | undefined} options.filter
   * @param {boolean} [options.strict]
   * @returns {boolean} true if the row group can be skipped
   */
  function canSkipRowGroup({ rowGroup, physicalColumns, filter, strict = true }) {
    if (!filter) return false

    // Handle logical operators
    if ('$and' in filter && Array.isArray(filter.$and)) {
      // For AND, we can skip if ANY condition allows skipping
      return filter.$and.some(subFilter => canSkipRowGroup({ rowGroup, physicalColumns, filter: subFilter, strict }))
    }
    if ('$or' in filter && Array.isArray(filter.$or)) {
      // For OR, we can skip only if ALL conditions allow skipping
      return filter.$or.every(subFilter => canSkipRowGroup({ rowGroup, physicalColumns, filter: subFilter, strict }))
    }
    if ('$nor' in filter && Array.isArray(filter.$nor)) {
      // For NOR, we can skip if none of the conditions allow skipping
      // This is complex, so we'll be conservative and not skip
      return false
    }

    // Check column filters
    for (const [field, condition] of Object.entries(filter)) {
      // Find the column chunk for this field
      const columnIndex = physicalColumns.indexOf(field);
      if (columnIndex === -1) continue

      const stats = rowGroup.columns[columnIndex].meta_data?.statistics;
      if (!stats) continue // No statistics available, can't skip

      const { min, max, min_value, max_value } = stats;
      const minVal = min_value !== undefined ? min_value : min;
      const maxVal = max_value !== undefined ? max_value : max;

      if (minVal === undefined || maxVal === undefined) continue

      // Handle operators
      for (const [operator, target] of Object.entries(condition || {})) {
        if (operator === '$gt' && maxVal <= target) return true
        if (operator === '$gte' && maxVal < target) return true
        if (operator === '$lt' && minVal >= target) return true
        if (operator === '$lte' && minVal > target) return true
        if (operator === '$eq' && (target < minVal || target > maxVal)) return true
        if (operator === '$ne' && equals(minVal, maxVal, strict) && equals(minVal, target, strict)) return true
        if (operator === '$in' && Array.isArray(target) && target.every(v => v < minVal || v > maxVal)) return true
        if (operator === '$nin' && Array.isArray(target) && equals(minVal, maxVal, strict) && target.includes(minVal)) return true
      }
    }

    return false
  }

  /**
   * Resolve a dot-notation path to a value in a nested object.
   *
   * @param {Record<string, any>} record
   * @param {string} path
   * @returns {any}
   */
  function resolve(record, path) {
    let value = record;
    for (const part of path.split('.')) {
      value = value?.[part];
    }
    return value
  }

  /**
   * @import {AsyncBuffer, ByteRange, ChunkPlan, GroupPlan, ParquetReadOptions, QueryPlan} from '../src/types.js'
   */

  // Combine column chunks if less than 2mb
  const runLimit = 1 << 21; // 2mb

  /**
   * Plan which byte ranges to read to satisfy a read request.
   * Metadata must be non-null.
   *
   * @param {ParquetReadOptions} options
   * @returns {QueryPlan}
   */
  function parquetPlan({ metadata, rowStart = 0, rowEnd = Infinity, columns, filter, filterStrict = true, useOffsetIndex = false }) {
    if (!metadata) throw new Error('parquetPlan requires metadata')
    /** @type {GroupPlan[]} */
    const groups = [];
    /** @type {ByteRange[]} */
    const fetches = [];
    /** @type {ByteRange[]} */
    const indexes = [];
    const physicalColumns = getPhysicalColumns(parquetSchema(metadata));

    // find which row groups to read
    let groupStart = 0; // first row index of the current group
    for (const rowGroup of metadata.row_groups) {
      const groupRows = Number(rowGroup.num_rows);
      const groupEnd = groupStart + groupRows;
      // if row group overlaps with row range, add it to the plan
      if (groupRows > 0 && groupEnd > rowStart && groupStart < rowEnd && !canSkipRowGroup({ rowGroup, physicalColumns, filter, strict: filterStrict })) {
        /** @type {ChunkPlan[]} */
        const chunks = [];
        let groupStartByte = Infinity;
        let groupEndByte = -Infinity;
        // loop through each column chunk
        for (const chunk of rowGroup.columns) {
          const meta = chunk.meta_data;
          if (chunk.file_path) throw new Error('parquet file_path not supported')
          if (!meta) throw new Error('parquet column metadata is undefined')
          // add included column chunks to the plan
          if (!columns || columns.includes(meta.path_in_schema[0])) {
            // full column chunk
            const columnOffset = meta.dictionary_page_offset || meta.data_page_offset;
            const startByte = Number(columnOffset);
            const endByte = Number(columnOffset + meta.total_compressed_size);
            // update group byte range
            if (startByte < groupStartByte) groupStartByte = startByte;
            if (endByte > groupEndByte) groupEndByte = endByte;

            if (useOffsetIndex && chunk.offset_index_offset && chunk.offset_index_length && (rowStart > groupStart || rowEnd < groupEnd)) {
              const offsetIndexStart = Number(chunk.offset_index_offset);
              chunks.push({
                columnMetadata: meta,
                offsetIndex: {
                  startByte: offsetIndexStart,
                  endByte: offsetIndexStart + chunk.offset_index_length,
                },
                range: { startByte, endByte },
              });
            } else {
              chunks.push({
                columnMetadata: meta,
                range: { startByte, endByte },
              });
            }

          }
        }
        const selectStart = Math.max(rowStart - groupStart, 0);
        const selectEnd = Math.min(rowEnd - groupStart, groupRows);
        groups.push({ chunks, rowGroup, groupStart, groupRows, selectStart, selectEnd });

        // combine runs of column chunks
        /** @type {ByteRange | undefined} */
        let run;
        for (const chunk of chunks) {
          if ('offsetIndex' in chunk) {
            indexes.push(chunk.offsetIndex);
          } else {
            const { range } = chunk;
            if (columns) {
              fetches.push(range);
            } else if (run && range.endByte - run.startByte <= runLimit) {
              // extend range
              run.endByte = range.endByte;
            } else {
              // new range
              if (run) fetches.push(run);
              run = { ...range };
            }
          }
        }
        if (run) fetches.push(run);
      }

      groupStart = groupEnd;
    }
    if (!isFinite(rowEnd)) rowEnd = groupStart;
    fetches.push(...indexes);

    return { metadata, rowStart, rowEnd, columns, fetches, groups }
  }

  /**
   * Prefetch byte ranges from an AsyncBuffer.
   *
   * @param {AsyncBuffer} file
   * @param {QueryPlan} plan
   * @returns {AsyncBuffer}
   */
  function prefetchAsyncBuffer(file, { fetches }) {
    // fetch byte ranges from the file
    const promises = fetches.map(({ startByte, endByte }) => file.slice(startByte, endByte));
    return {
      byteLength: file.byteLength,
      slice(start, end = file.byteLength) {
        // find matching slice
        const index = fetches.findIndex(({ startByte, endByte }) => startByte <= start && end <= endByte);
        if (index < 0) {
          // fallback to direct read
          return file.slice(start, end)
        }
        if (fetches[index].startByte !== start || fetches[index].endByte !== end) {
          // slice a subrange of the prefetch
          const startOffset = start - fetches[index].startByte;
          const endOffset = end - fetches[index].startByte;
          if (promises[index] instanceof Promise) {
            return promises[index].then(buffer => buffer.slice(startOffset, endOffset))
          } else {
            return promises[index].slice(startOffset, endOffset)
          }
        } else {
          return promises[index]
        }
      },
    }
  }

  /**
   * @import {DataReader, ParquetParsers, VariantMetadata} from '../src/types.js'
   */

  const decoder = new TextDecoder();
  /** @type {WeakMap<object, Map<string, VariantMetadata>>} */
  const metadataCache = new WeakMap();

  /**
   * Recursively decode variant structs into native values.
   *
   * @param {any} value
   * @param {ParquetParsers} [parsers]
   * @returns {any}
   */
  function decodeVariantColumn(value, parsers = DEFAULT_PARSERS) {
    if (Array.isArray(value)) {
      return value.map(entry => decodeVariantColumn(entry, parsers))
    }
    if (typeof value !== 'object') return value

    if ('metadata' in value) {
      const metadata = parseVariantMetadata(value.metadata);

      // Decode shredded fields from typed_value
      const shreddedFields = value.typed_value && decodeTypedValue(value.typed_value, metadata, parsers);

      // Decode binary value (may contain additional fields for partially shredded objects)
      const binaryValue = value.value && readVariant(makeReader(value.value), metadata, parsers);

      // Merge shredded and binary values for partially shredded objects
      if (shreddedFields && binaryValue) {
        return { ...binaryValue, ...shreddedFields }
      }
      return shreddedFields ?? binaryValue
    }

    return value
  }

  /**
   * Decode a shredded variant typed_value field.
   *
   * @param {any} typedValue
   * @param {VariantMetadata} metadata
   * @param {ParquetParsers} parsers
   * @returns {any}
   */
  function decodeTypedValue(typedValue, metadata, parsers) {
    // Handle {typed_value, value} wrapper - unwrap and recurse
    if (typedValue && typeof typedValue === 'object' && !Array.isArray(typedValue) && !(typedValue instanceof Uint8Array)) {
      if ('typed_value' in typedValue) {
        return decodeTypedValue(typedValue.typed_value, metadata, parsers)
      }
      if ('value' in typedValue && typedValue.value instanceof Uint8Array) {
        return readVariant(makeReader(typedValue.value), metadata, parsers)
      }
      // Shredded object: each field value gets decoded
      /** @type {Record<string, any>} */
      const result = {};
      for (const [key, field] of Object.entries(typedValue)) {
        result[key] = decodeTypedValue(field, metadata, parsers);
      }
      return result
    }

    // Uint8Array: decode as binary variant
    if (typedValue instanceof Uint8Array) {
      return readVariant(makeReader(typedValue), metadata, parsers)
    }

    // Arrays
    if (Array.isArray(typedValue)) {
      return typedValue.map(element => decodeTypedValue(element, metadata, parsers))
    }

    return typedValue
  }

  /**
   * @param {Uint8Array} bytes
   * @returns {DataReader}
   */
  function makeReader(bytes) {
    return { view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), offset: 0 }
  }

  /**
   * Parse and cache variant metadata dictionary.
   *
   * @param {Uint8Array} bytes
   * @returns {VariantMetadata}
   */
  function parseVariantMetadata(bytes) {
    let bufferCache = metadataCache.get(bytes.buffer);
    if (!bufferCache) {
      bufferCache = new Map();
      metadataCache.set(bytes.buffer, bufferCache);
    }
    const key = `${bytes.byteOffset}:${bytes.byteLength}`;
    const cached = bufferCache.get(key);
    if (cached) return cached

    const reader = makeReader(bytes);
    const header = reader.view.getUint8(reader.offset++);
    const version = header & 0x0f;
    if (version !== 1) throw new Error(`parquet unsupported variant metadata version: ${version}`)
    const sorted = (header >> 4 & 0x1) === 1;
    const offsetSize = (header >> 6 & 0x3) + 1;

    const dictionarySize = readUnsigned(reader, offsetSize);

    const offsets = new Array(dictionarySize + 1);
    for (let i = 0; i < offsets.length; i++) {
      offsets[i] = readUnsigned(reader, offsetSize);
    }

    const base = reader.offset;
    const dictionary = new Array(dictionarySize);
    for (let i = 0; i < dictionarySize; i++) {
      const start = offsets[i];
      const end = offsets[i + 1];
      const strBytes = new Uint8Array(bytes.buffer, bytes.byteOffset + base + start, end - start);
      dictionary[i] = decoder.decode(strBytes);
    }

    const metadata = { dictionary, sorted };
    bufferCache.set(key, metadata);
    return metadata
  }

  /**
   * @param {DataReader} reader
   * @param {number} byteWidth
   * @returns {number}
   */
  function readUnsigned(reader, byteWidth) {
    let value = 0;
    for (let i = 0; i < byteWidth; i++) {
      value |= reader.view.getUint8(reader.offset + i) << i * 8;
    }
    reader.offset += byteWidth;
    return value
  }

  /**
   * @param {DataReader} reader
   * @param {VariantMetadata} metadata
   * @param {ParquetParsers} parsers
   * @returns {any}
   */
  function readVariant(reader, metadata, parsers) {
    const typeByte = reader.view.getUint8(reader.offset++);
    const basicType = typeByte & 0x3;
    const header = typeByte >> 2;
    if (basicType === 0) return readVariantPrimitive(reader, header, parsers)
    if (basicType === 2) return readVariantObject(reader, header, metadata, parsers)
    if (basicType === 3) return readVariantArray(reader, header, metadata, parsers)
    // else short string
    const bytes = new Uint8Array(reader.view.buffer, reader.view.byteOffset + reader.offset, header);
    reader.offset += header;
    return decoder.decode(bytes)
  }

  /**
   * @param {DataReader} reader
   * @param {number} typeId
   * @param {ParquetParsers} parsers
   * @returns {any}
   */
  function readVariantPrimitive(reader, typeId, parsers) {
    switch (typeId) {
    case 0: return null
    case 1: return true
    case 2: return false
    case 3: {
      const value = reader.view.getInt8(reader.offset);
      reader.offset += 1;
      return value
    }
    case 4: {
      const value = reader.view.getInt16(reader.offset, true);
      reader.offset += 2;
      return value
    }
    case 5: {
      const value = reader.view.getInt32(reader.offset, true);
      reader.offset += 4;
      return value
    }
    case 6: {
      const value = reader.view.getBigInt64(reader.offset, true);
      reader.offset += 8;
      return value
    }
    case 7: {
      const value = reader.view.getFloat64(reader.offset, true);
      reader.offset += 8;
      return value
    }
    case 8:
      return readVariantDecimal(reader, 4)
    case 9:
      return readVariantDecimal(reader, 8)
    case 10:
      return readVariantDecimal(reader, 16)
    case 11: {
      const value = reader.view.getInt32(reader.offset, true);
      reader.offset += 4;
      return parsers.dateFromDays(value)
    }
    case 12: // timestamp_micros (utc)
    case 13: { // timestamp_micros_ntz (no timezone)
      const value = reader.view.getBigInt64(reader.offset, true);
      reader.offset += 8;
      return parsers.timestampFromMicroseconds(value)
    }
    case 14: {
      const value = reader.view.getFloat32(reader.offset, true);
      reader.offset += 4;
      return value
    }
    case 15:
      return readVariantBinary(reader)
    case 16: {
      const bytes = readVariantBinary(reader);
      return decoder.decode(bytes)
    }
    case 17: {
      // time: microseconds since midnight
      const value = reader.view.getBigInt64(reader.offset, true);
      reader.offset += 8;
      return value
    }
    case 18: // timestamp_nanos (utc)
    case 19: { // timestamp_nanos_ntz (no timezone)
      const value = reader.view.getBigInt64(reader.offset, true);
      reader.offset += 8;
      return parsers.timestampFromNanoseconds(value)
    }
    case 20: {
      const bytes = new Uint8Array(reader.view.buffer, reader.view.byteOffset + reader.offset, 16);
      reader.offset += 16;
      const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    }
    default:
      throw new Error(`parquet unsupported variant primitive type: ${typeId}`)
    }
  }

  /**
   * @param {DataReader} reader
   * @param {number} header
   * @param {VariantMetadata} metadata
   * @param {ParquetParsers} parsers
   * @returns {Record<string, any>}
   */
  function readVariantObject(reader, header, metadata, parsers) {
    const offsetWidth = (header & 0x3) + 1;
    const idWidth = (header >> 2 & 0x3) + 1;
    const isLarge = header >> 4 & 0x1;
    const numElements = isLarge ? readUnsigned(reader, 4) : reader.view.getUint8(reader.offset++);

    /** @type {number[]} */
    const fieldIds = new Array(numElements);
    for (let i = 0; i < numElements; i++) {
      fieldIds[i] = readUnsigned(reader, idWidth);
    }

    const offsets = new Array(numElements + 1);
    for (let i = 0; i < offsets.length; i++) {
      offsets[i] = readUnsigned(reader, offsetWidth);
    }

    /** @type {Record<string, any>} */
    const out = {};
    for (let i = 0; i < numElements; i++) {
      const key = metadata.dictionary[fieldIds[i]];
      // Read value at the given offset
      const valueReader = {
        view: reader.view,
        offset: reader.offset + offsets[i],
      };
      out[key] = readVariant(valueReader, metadata, parsers);
    }
    reader.offset += offsets[offsets.length - 1];
    return out
  }

  /**
   * @param {DataReader} reader
   * @param {number} header
   * @param {VariantMetadata} metadata
   * @param {ParquetParsers} parsers
   * @returns {any[]}
   */
  function readVariantArray(reader, header, metadata, parsers) {
    const fieldOffsetSize = header & 0x3;
    const isLarge = header >> 2 & 0x1;
    const offsetWidth = fieldOffsetSize + 1;
    const numElements = readUnsigned(reader, isLarge ? 4 : 1);

    const offsets = new Array(numElements + 1);
    for (let i = 0; i < offsets.length; i++) {
      offsets[i] = readUnsigned(reader, offsetWidth);
    }

    const valuesStart = reader.offset;
    const result = new Array(numElements);
    for (let i = 0; i < numElements; i++) {
      const valueReader = {
        view: reader.view,
        offset: valuesStart + offsets[i],
      };
      result[i] = readVariant(valueReader, metadata, parsers);
    }
    reader.offset = valuesStart + offsets[offsets.length - 1];
    return result
  }

  /**
   * @param {DataReader} reader
   * @param {number} width
   * @returns {number}
   */
  function readVariantDecimal(reader, width) {
    const scale = reader.view.getUint8(reader.offset);
    reader.offset += 1;
    let unscaled;
    if (width === 4) {
      unscaled = BigInt(reader.view.getInt32(reader.offset, true));
      reader.offset += 4;
    } else if (width === 8) {
      unscaled = reader.view.getBigInt64(reader.offset, true);
      reader.offset += 8;
    } else {
      const low = reader.view.getBigUint64(reader.offset, true);
      const high = reader.view.getBigInt64(reader.offset + 8, true);
      unscaled = high << 64n | low;
      reader.offset += 16;
    }

    return Number(unscaled) * 10 ** -scale
  }

  /**
   * @param {DataReader} reader
   * @returns {Uint8Array}
   */
  function readVariantBinary(reader) {
    const length = reader.view.getUint32(reader.offset, true);
    reader.offset += 4;
    const bytes = new Uint8Array(reader.view.buffer, reader.view.byteOffset + reader.offset, length);
    reader.offset += length;
    return bytes
  }

  /**
   * Reconstructs a complex nested structure from flat arrays of values and
   * definition and repetition levels, according to Dremel encoding.
   *
   * @param {any[]} output
   * @param {number[] | undefined} definitionLevels
   * @param {number[]} repetitionLevels
   * @param {DecodedArray} values
   * @param {SchemaTree[]} schemaPath
   * @returns {DecodedArray}
   */
  function assembleLists(output, definitionLevels, repetitionLevels, values, schemaPath) {
    const maxDefinitionLevel = getMaxDefinitionLevel(schemaPath);
    // If no def/rep levels, synthesize def levels at max
    if (!definitionLevels?.length && !repetitionLevels.length) {
      if (!maxDefinitionLevel || !values.length) return values
      definitionLevels = new Array(values.length).fill(maxDefinitionLevel);
    }
    const n = definitionLevels?.length || repetitionLevels.length;
    const repetitionPath = schemaPath.map(({ element }) => element.repetition_type);
    let valueIndex = 0;

    // Track state of nested structures
    const containerStack = [output];
    let currentContainer = output;
    let currentDepth = 0; // schema depth
    let currentDefLevel = 0; // list depth
    let currentRepLevel = 0;

    if (repetitionLevels[0]) {
      // continue previous row
      while (currentDepth < repetitionPath.length - 2 && currentRepLevel < repetitionLevels[0]) {
        currentDepth++;
        if (repetitionPath[currentDepth] !== 'REQUIRED') {
          // go into last list
          currentContainer = currentContainer.at(-1);
          containerStack.push(currentContainer);
          currentDefLevel++;
        }
        if (repetitionPath[currentDepth] === 'REPEATED') currentRepLevel++;
      }
    }

    for (let i = 0; i < n; i++) {
      // assert(currentDefLevel === containerStack.length - 1)
      const def = definitionLevels?.length ? definitionLevels[i] : maxDefinitionLevel;
      const rep = repetitionLevels[i];

      // Pop up to start of rep level
      while (currentDepth && (rep < currentRepLevel || repetitionPath[currentDepth] !== 'REPEATED')) {
        if (repetitionPath[currentDepth] !== 'REQUIRED') {
          containerStack.pop();
          currentDefLevel--;
        }
        if (repetitionPath[currentDepth] === 'REPEATED') currentRepLevel--;
        currentDepth--;
      }
      // @ts-expect-error won't be empty
      currentContainer = containerStack.at(-1);

      // Go deeper to end of definition level
      while (
        (currentDepth < repetitionPath.length - 2 || repetitionPath[currentDepth + 1] === 'REPEATED') &&
        (currentDefLevel < def || repetitionPath[currentDepth + 1] === 'REQUIRED')
      ) {
        currentDepth++;
        if (repetitionPath[currentDepth] !== 'REQUIRED') {
          /** @type {any[]} */
          const newList = [];
          currentContainer.push(newList);
          currentContainer = newList;
          containerStack.push(newList);
          currentDefLevel++;
        }
        if (repetitionPath[currentDepth] === 'REPEATED') currentRepLevel++;
      }

      // Add value or null based on definition level
      if (def === maxDefinitionLevel) {
        // assert(currentDepth === maxDefinitionLevel || currentDepth === repetitionPath.length - 2)
        currentContainer.push(values[valueIndex++]);
      } else if (currentDepth === repetitionPath.length - 2) {
        currentContainer.push(null);
      } else {
        currentContainer.push([]);
      }
    }

    // Handle edge cases for empty inputs or single-level data
    if (!output.length) {
      // return max definition level of nested lists
      for (let i = 0; i < maxDefinitionLevel; i++) {
        /** @type {any[]} */
        const newList = [];
        currentContainer.push(newList);
        currentContainer = newList;
      }
    }

    return output
  }

  /**
   * Assemble a nested structure from subcolumn data.
   *
   * @param {Map<string, DecodedArray>} subcolumnData
   * @param {SchemaTree} schema top-level schema element
   * @param {ParquetParsers} parsers
   * @param {number} [depth] depth of nested structure
   */
  function assembleNested(subcolumnData, schema, parsers, depth = 0) {
    const path = schema.path.join('.');
    const optional = schema.element.repetition_type === 'OPTIONAL';
    const nextDepth = optional ? depth + 1 : depth;

    if (isListLike(schema)) {
      let sublist = schema.children[0];
      let subDepth = nextDepth;
      if (sublist.children.length === 1) {
        sublist = sublist.children[0];
        subDepth++;
      }
      assembleNested(subcolumnData, sublist, parsers, subDepth);

      const subcolumn = sublist.path.join('.');
      const values = subcolumnData.get(subcolumn);
      if (!values) throw new Error('parquet list column missing values')
      if (optional) flattenAtDepth(values, depth);
      subcolumnData.set(path, values);
      subcolumnData.delete(subcolumn);
      return
    }

    if (isMapLike(schema)) {
      const mapName = schema.children[0].element.name;

      // Assemble keys and values
      assembleNested(subcolumnData, schema.children[0].children[0], parsers, nextDepth + 1);
      assembleNested(subcolumnData, schema.children[0].children[1], parsers, nextDepth + 1);

      const keys = subcolumnData.get(`${path}.${mapName}.key`);
      const values = subcolumnData.get(`${path}.${mapName}.value`);

      if (!keys) throw new Error('parquet map column missing keys')
      if (!values) throw new Error('parquet map column missing values')
      if (keys.length !== values.length) {
        throw new Error('parquet map column key/value length mismatch')
      }

      const out = assembleMaps(keys, values, nextDepth);
      if (optional) flattenAtDepth(out, depth);

      subcolumnData.delete(`${path}.${mapName}.key`);
      subcolumnData.delete(`${path}.${mapName}.value`);
      subcolumnData.set(path, out);
      return
    }

    // Struct-like column
    if (schema.children.length) {
      // construct a meta struct and then invert
      const invertDepth = schema.element.repetition_type === 'REQUIRED' ? depth : depth + 1;
      /** @type {Record<string, any>} */
      const struct = {};
      for (const child of schema.children) {
        assembleNested(subcolumnData, child, parsers, invertDepth);
        const childData = subcolumnData.get(child.path.join('.'));
        if (!childData) throw new Error('parquet struct missing child data')
        struct[child.element.name] = childData;
      }
      // remove children
      for (const child of schema.children) {
        subcolumnData.delete(child.path.join('.'));
      }

      // invert struct by depth
      let inverted = invertStruct(struct, invertDepth);
      if (schema.element.logical_type?.type === 'VARIANT') {
        inverted = decodeVariantColumn(inverted, parsers);
      }
      if (optional) flattenAtDepth(inverted, depth);
      subcolumnData.set(path, inverted);
    }
  }

  /**
   * @import {DecodedArray, ParquetParsers, SchemaTree} from '../src/types.js'
   * @param {DecodedArray} arr
   * @param {number} depth
   */
  function flattenAtDepth(arr, depth) {
    for (let i = 0; i < arr.length; i++) {
      if (depth) {
        flattenAtDepth(arr[i], depth - 1);
      } else {
        arr[i] = arr[i][0];
      }
    }
  }

  /**
   * @param {DecodedArray} keys
   * @param {DecodedArray} values
   * @param {number} depth
   * @returns {any[]}
   */
  function assembleMaps(keys, values, depth) {
    const out = [];
    for (let i = 0; i < keys.length; i++) {
      if (depth) {
        out.push(assembleMaps(keys[i], values[i], depth - 1)); // go deeper
      } else {
        if (keys[i]) {
          /** @type {Record<string, any>} */
          const obj = {};
          for (let j = 0; j < keys[i].length; j++) {
            const value = values[i][j];
            obj[keys[i][j]] = value === undefined ? null : value;
          }
          out.push(obj);
        } else {
          out.push(undefined);
        }
      }
    }
    return out
  }

  /**
   * Invert a struct-like object by depth.
   *
   * @param {Record<string, any[]>} struct
   * @param {number} depth
   * @returns {any[]}
   */
  function invertStruct(struct, depth) {
    const keys = Object.keys(struct);
    const length = struct[keys[0]]?.length;
    const out = [];
    for (let i = 0; i < length; i++) {
      /** @type {Record<string, any>} */
      const obj = {};
      for (const key of keys) {
        if (struct[key].length !== length) throw new Error('parquet struct parsing error')
        obj[key] = struct[key][i];
      }
      if (depth) {
        out.push(invertStruct(obj, depth - 1)); // deeper
      } else {
        out.push(obj);
      }
    }
    return out
  }

  /**
   * @import {DataReader} from '../src/types.js'
   */


  /**
   * @param {DataReader} reader
   * @param {number} count number of values to read
   * @param {Int32Array | BigInt64Array} output
   */
  function deltaBinaryUnpack(reader, count, output) {
    const int32 = output instanceof Int32Array;
    const blockSize = readVarInt(reader);
    const miniblockPerBlock = readVarInt(reader);
    readVarInt(reader); // assert(=== count)
    let value = readZigZagBigInt(reader); // first value
    let outputIndex = 0;
    output[outputIndex++] = int32 ? Number(value) : value;

    const valuesPerMiniblock = blockSize / miniblockPerBlock;

    while (outputIndex < count) {
      // new block
      const minDelta = readZigZagBigInt(reader);
      const bitWidths = new Uint8Array(miniblockPerBlock);
      for (let i = 0; i < miniblockPerBlock; i++) {
        bitWidths[i] = reader.view.getUint8(reader.offset++);
      }

      for (let i = 0; i < miniblockPerBlock && outputIndex < count; i++) {
        // new miniblock
        const bitWidth = BigInt(bitWidths[i]);
        if (bitWidth) {
          let bitpackPos = 0n;
          let miniblockCount = valuesPerMiniblock;
          const mask = (1n << bitWidth) - 1n;
          while (miniblockCount && outputIndex < count) {
            let bits = BigInt(reader.view.getUint8(reader.offset)) >> bitpackPos & mask; // TODO: don't re-read value every time
            bitpackPos += bitWidth;
            while (bitpackPos >= 8) {
              bitpackPos -= 8n;
              reader.offset++;
              if (bitpackPos) {
                bits |= BigInt(reader.view.getUint8(reader.offset)) << bitWidth - bitpackPos & mask;
              }
            }
            const delta = minDelta + bits;
            value += delta;
            output[outputIndex++] = int32 ? Number(value) : value;
            miniblockCount--;
          }
          if (miniblockCount) {
            // consume leftover miniblock
            reader.offset += Math.ceil((miniblockCount * Number(bitWidth) + Number(bitpackPos)) / 8);
          }
        } else {
          for (let j = 0; j < valuesPerMiniblock && outputIndex < count; j++) {
            value += minDelta;
            output[outputIndex++] = int32 ? Number(value) : value;
          }
        }
      }
    }
  }

  /**
   * @param {DataReader} reader
   * @param {number} count
   * @param {Uint8Array[]} output
   */
  function deltaLengthByteArray$1(reader, count, output) {
    const lengths = new Int32Array(count);
    deltaBinaryUnpack(reader, count, lengths);
    for (let i = 0; i < count; i++) {
      output[i] = new Uint8Array(reader.view.buffer, reader.view.byteOffset + reader.offset, lengths[i]);
      reader.offset += lengths[i];
    }
  }

  /**
   * @param {DataReader} reader
   * @param {number} count
   * @param {Uint8Array[]} output
   */
  function deltaByteArray$1(reader, count, output) {
    const prefixData = new Int32Array(count);
    deltaBinaryUnpack(reader, count, prefixData);
    const suffixData = new Int32Array(count);
    deltaBinaryUnpack(reader, count, suffixData);

    for (let i = 0; i < count; i++) {
      const suffix = new Uint8Array(reader.view.buffer, reader.view.byteOffset + reader.offset, suffixData[i]);
      if (prefixData[i]) {
        // copy from previous value
        output[i] = new Uint8Array(prefixData[i] + suffixData[i]);
        output[i].set(output[i - 1].subarray(0, prefixData[i]));
        output[i].set(suffix, prefixData[i]);
      } else {
        output[i] = suffix;
      }
      reader.offset += suffixData[i];
    }
  }

  /**
   * @import {DataReader, DecodedArray, ParquetType} from '../src/types.js'
   */


  /**
   * Read values from a run-length encoded/bit-packed hybrid encoding.
   *
   * If length is zero, then read int32 length at the start.
   *
   * @param {DataReader} reader
   * @param {number} width - bitwidth
   * @param {DecodedArray} output
   * @param {number} [length] - length of the encoded data
   */
  function readRleBitPackedHybrid(reader, width, output, length) {
    if (length === undefined) {
      length = reader.view.getUint32(reader.offset, true);
      reader.offset += 4;
    }
    const startOffset = reader.offset;
    let seen = 0;
    while (seen < output.length) {
      const header = readVarInt(reader);
      if (header & 1) {
        // bit-packed
        seen = readBitPacked(reader, header, width, output, seen);
      } else {
        // rle
        const count = header >>> 1;
        readRle(reader, count, width, output, seen);
        seen += count;
      }
    }
    reader.offset = startOffset + length; // duckdb writes an empty block
  }

  /**
   * Run-length encoding: read value with bitWidth and repeat it count times.
   *
   * @param {DataReader} reader
   * @param {number} count
   * @param {number} bitWidth
   * @param {DecodedArray} output
   * @param {number} seen
   */
  function readRle(reader, count, bitWidth, output, seen) {
    const width = bitWidth + 7 >> 3;
    let value = 0;
    for (let i = 0; i < width; i++) {
      value |= reader.view.getUint8(reader.offset++) << (i << 3);
    }
    // assert(value < 1 << bitWidth)

    // repeat value count times
    for (let i = 0; i < count; i++) {
      output[seen + i] = value;
    }
  }

  /**
   * Read a bit-packed run of the rle/bitpack hybrid.
   * Supports width > 8 (crossing bytes).
   *
   * @param {DataReader} reader
   * @param {number} header - bit-pack header
   * @param {number} bitWidth
   * @param {DecodedArray} output
   * @param {number} seen
   * @returns {number} total output values so far
   */
  function readBitPacked(reader, header, bitWidth, output, seen) {
    let count = header >> 1 << 3; // values to read
    const mask = (1 << bitWidth) - 1;

    let data = 0;
    if (reader.offset < reader.view.byteLength) {
      data = reader.view.getUint8(reader.offset++);
    } else if (mask) {
      // sometimes out-of-bounds reads are masked out
      throw new Error(`parquet bitpack offset ${reader.offset} out of range`)
    }
    let left = 8;
    let right = 0;

    // read values
    while (count) {
      // if we have crossed a byte boundary, shift the data
      if (right > 8) {
        right -= 8;
        left -= 8;
        data >>>= 8;
      } else if (left - right < bitWidth) {
        // if we don't have bitWidth number of bits to read, read next byte
        data |= reader.view.getUint8(reader.offset) << left;
        reader.offset++;
        left += 8;
      } else {
        if (seen < output.length) {
          // emit value
          output[seen++] = data >> right & mask;
        }
        count--;
        right += bitWidth;
      }
    }

    return seen
  }

  /**
   * @param {DataReader} reader
   * @param {number} count
   * @param {ParquetType} type
   * @param {number | undefined} typeLength
   * @returns {DecodedArray}
   */
  function byteStreamSplit(reader, count, type, typeLength) {
    const width = byteWidth(type, typeLength);
    const bytes = new Uint8Array(count * width);
    for (let b = 0; b < width; b++) {
      for (let i = 0; i < count; i++) {
        bytes[i * width + b] = reader.view.getUint8(reader.offset++);
      }
    }
    // interpret bytes as typed array
    if (type === 'FLOAT') return new Float32Array(bytes.buffer)
    else if (type === 'DOUBLE') return new Float64Array(bytes.buffer)
    else if (type === 'INT32') return new Int32Array(bytes.buffer)
    else if (type === 'INT64') return new BigInt64Array(bytes.buffer)
    else if (type === 'FIXED_LEN_BYTE_ARRAY') {
      // split into arrays of typeLength
      const split = new Array(count);
      for (let i = 0; i < count; i++) {
        split[i] = bytes.subarray(i * width, (i + 1) * width);
      }
      return split
    }
    throw new Error(`parquet byte_stream_split unsupported type: ${type}`)
  }

  /**
   * @param {ParquetType} type
   * @param {number | undefined} typeLength
   * @returns {number}
   */
  function byteWidth(type, typeLength) {
    switch (type) {
    case 'INT32':
    case 'FLOAT':
      return 4
    case 'INT64':
    case 'DOUBLE':
      return 8
    case 'FIXED_LEN_BYTE_ARRAY':
      if (!typeLength) throw new Error('parquet byteWidth missing type_length')
      return typeLength
    default:
      throw new Error(`parquet unsupported type: ${type}`)
    }
  }

  /**
   * Read `count` values of the given type from the reader.view.
   *
   * @param {DataReader} reader - buffer to read data from
   * @param {ParquetType} type - parquet type of the data
   * @param {number} count - number of values to read
   * @param {number | undefined} fixedLength - length of each fixed length byte array
   * @returns {DecodedArray} array of values
   */
  function readPlain(reader, type, count, fixedLength) {
    if (count === 0) return []
    if (type === 'BOOLEAN') {
      return readPlainBoolean(reader, count)
    } else if (type === 'INT32') {
      return readPlainInt32(reader, count)
    } else if (type === 'INT64') {
      return readPlainInt64(reader, count)
    } else if (type === 'INT96') {
      return readPlainInt96(reader, count)
    } else if (type === 'FLOAT') {
      return readPlainFloat(reader, count)
    } else if (type === 'DOUBLE') {
      return readPlainDouble(reader, count)
    } else if (type === 'BYTE_ARRAY') {
      return readPlainByteArray(reader, count)
    } else if (type === 'FIXED_LEN_BYTE_ARRAY') {
      if (!fixedLength) throw new Error('parquet missing fixed length')
      return readPlainByteArrayFixed(reader, count, fixedLength)
    } else {
      throw new Error(`parquet unhandled type: ${type}`)
    }
  }

  /**
   * Read `count` boolean values.
   *
   * @param {DataReader} reader
   * @param {number} count
   * @returns {boolean[]}
   */
  function readPlainBoolean(reader, count) {
    const values = new Array(count);
    for (let i = 0; i < count; i++) {
      const byteOffset = reader.offset + (i / 8 | 0);
      const bitOffset = i % 8;
      const byte = reader.view.getUint8(byteOffset);
      values[i] = (byte & 1 << bitOffset) !== 0;
    }
    reader.offset += Math.ceil(count / 8);
    return values
  }

  /**
   * Read `count` int32 values.
   *
   * @param {DataReader} reader
   * @param {number} count
   * @returns {Int32Array}
   */
  function readPlainInt32(reader, count) {
    const values = (reader.view.byteOffset + reader.offset) % 4
      ? new Int32Array(align(reader.view.buffer, reader.view.byteOffset + reader.offset, count * 4))
      : new Int32Array(reader.view.buffer, reader.view.byteOffset + reader.offset, count);
    reader.offset += count * 4;
    return values
  }

  /**
   * Read `count` int64 values.
   *
   * @param {DataReader} reader
   * @param {number} count
   * @returns {BigInt64Array}
   */
  function readPlainInt64(reader, count) {
    const values = (reader.view.byteOffset + reader.offset) % 8
      ? new BigInt64Array(align(reader.view.buffer, reader.view.byteOffset + reader.offset, count * 8))
      : new BigInt64Array(reader.view.buffer, reader.view.byteOffset + reader.offset, count);
    reader.offset += count * 8;
    return values
  }

  /**
   * Read `count` int96 values.
   *
   * @param {DataReader} reader
   * @param {number} count
   * @returns {bigint[]}
   */
  function readPlainInt96(reader, count) {
    const values = new Array(count);
    for (let i = 0; i < count; i++) {
      const low = reader.view.getBigInt64(reader.offset + i * 12, true);
      const high = reader.view.getInt32(reader.offset + i * 12 + 8, true);
      values[i] = BigInt(high) << 64n | low;
    }
    reader.offset += count * 12;
    return values
  }

  /**
   * Read `count` float values.
   *
   * @param {DataReader} reader
   * @param {number} count
   * @returns {Float32Array}
   */
  function readPlainFloat(reader, count) {
    const values = (reader.view.byteOffset + reader.offset) % 4
      ? new Float32Array(align(reader.view.buffer, reader.view.byteOffset + reader.offset, count * 4))
      : new Float32Array(reader.view.buffer, reader.view.byteOffset + reader.offset, count);
    reader.offset += count * 4;
    return values
  }

  /**
   * Read `count` double values.
   *
   * @param {DataReader} reader
   * @param {number} count
   * @returns {Float64Array}
   */
  function readPlainDouble(reader, count) {
    const values = (reader.view.byteOffset + reader.offset) % 8
      ? new Float64Array(align(reader.view.buffer, reader.view.byteOffset + reader.offset, count * 8))
      : new Float64Array(reader.view.buffer, reader.view.byteOffset + reader.offset, count);
    reader.offset += count * 8;
    return values
  }

  /**
   * Read `count` byte array values.
   *
   * @param {DataReader} reader
   * @param {number} count
   * @returns {Uint8Array[]}
   */
  function readPlainByteArray(reader, count) {
    const values = new Array(count);
    for (let i = 0; i < count; i++) {
      const length = reader.view.getUint32(reader.offset, true);
      reader.offset += 4;
      values[i] = new Uint8Array(reader.view.buffer, reader.view.byteOffset + reader.offset, length);
      reader.offset += length;
    }
    return values
  }

  /**
   * Read a fixed length byte array.
   *
   * @param {DataReader} reader
   * @param {number} count
   * @param {number} fixedLength
   * @returns {Uint8Array[]}
   */
  function readPlainByteArrayFixed(reader, count, fixedLength) {
    // assert(reader.view.byteLength - reader.offset >= count * fixedLength)
    const values = new Array(count);
    for (let i = 0; i < count; i++) {
      values[i] = new Uint8Array(reader.view.buffer, reader.view.byteOffset + reader.offset, fixedLength);
      reader.offset += fixedLength;
    }
    return values
  }

  /**
   * Create a new buffer with the offset and size.
   *
   * @import {DataReader, DecodedArray, ParquetType} from '../src/types.js'
   * @param {ArrayBufferLike} buffer
   * @param {number} offset
   * @param {number} size
   * @returns {ArrayBuffer}
   */
  function align(buffer, offset, size) {
    const aligned = new ArrayBuffer(size);
    new Uint8Array(aligned).set(new Uint8Array(buffer, offset, size));
    return aligned
  }

  /**
   * The MIT License (MIT)
   * Copyright (c) 2016 Zhipeng Jia
   * https://github.com/zhipeng-jia/snappyjs
   */

  const WORD_MASK = [0, 0xff, 0xffff, 0xffffff, 0xffffffff];

  /**
   * Copy bytes from one array to another
   *
   * @param {Uint8Array} fromArray source array
   * @param {number} fromPos source position
   * @param {Uint8Array} toArray destination array
   * @param {number} toPos destination position
   * @param {number} length number of bytes to copy
   */
  function copyBytes(fromArray, fromPos, toArray, toPos, length) {
    for (let i = 0; i < length; i++) {
      toArray[toPos + i] = fromArray[fromPos + i];
    }
  }

  /**
   * Decompress snappy data.
   * Accepts an output buffer to avoid allocating a new buffer for each call.
   *
   * @param {Uint8Array} input compressed data
   * @param {Uint8Array} output output buffer
   */
  function snappyUncompress(input, output) {
    const inputLength = input.byteLength;
    const outputLength = output.byteLength;
    let pos = 0;
    let outPos = 0;

    // skip preamble (contains uncompressed length as varint)
    while (pos < inputLength) {
      const c = input[pos];
      pos++;
      if (c < 128) {
        break
      }
    }
    if (outputLength && pos >= inputLength) {
      throw new Error('invalid snappy length header')
    }

    while (pos < inputLength) {
      const c = input[pos];
      let len = 0;
      pos++;

      if (pos >= inputLength) {
        throw new Error('missing eof marker')
      }

      // There are two types of elements, literals and copies (back references)
      if ((c & 0x3) === 0) {
        // Literals are uncompressed data stored directly in the byte stream
        let len = (c >>> 2) + 1;
        // Longer literal length is encoded in multiple bytes
        if (len > 60) {
          if (pos + 3 >= inputLength) {
            throw new Error('snappy error literal pos + 3 >= inputLength')
          }
          const lengthSize = len - 60; // length bytes - 1
          len = input[pos]
            + (input[pos + 1] << 8)
            + (input[pos + 2] << 16)
            + (input[pos + 3] << 24);
          len = (len & WORD_MASK[lengthSize]) + 1;
          pos += lengthSize;
        }
        if (pos + len > inputLength) {
          throw new Error('snappy error literal exceeds input length')
        }
        copyBytes(input, pos, output, outPos, len);
        pos += len;
        outPos += len;
      } else {
        // Copy elements
        let offset = 0; // offset back from current position to read
        switch (c & 0x3) {
        case 1:
          // Copy with 1-byte offset
          len = (c >>> 2 & 0x7) + 4;
          offset = input[pos] + (c >>> 5 << 8);
          pos++;
          break
        case 2:
          // Copy with 2-byte offset
          if (inputLength <= pos + 1) {
            throw new Error('snappy error end of input')
          }
          len = (c >>> 2) + 1;
          offset = input[pos] + (input[pos + 1] << 8);
          pos += 2;
          break
        case 3:
          // Copy with 4-byte offset
          if (inputLength <= pos + 3) {
            throw new Error('snappy error end of input')
          }
          len = (c >>> 2) + 1;
          offset = input[pos]
            + (input[pos + 1] << 8)
            + (input[pos + 2] << 16)
            + (input[pos + 3] << 24);
          pos += 4;
          break
        default:
          break
        }
        if (offset === 0 || isNaN(offset)) {
          throw new Error(`invalid offset ${offset} pos ${pos} inputLength ${inputLength}`)
        }
        if (offset > outPos) {
          throw new Error('cannot copy from before start of buffer')
        }
        copyBytes(output, outPos - offset, output, outPos, len);
        outPos += len;
      }
    }

    if (outPos !== outputLength) throw new Error('premature end of input')
  }

  /**
   * @import {ColumnDecoder, CompressionCodec, Compressors, DataPage, DataPageHeader, DataPageHeaderV2, DataReader, DecodedArray, PageHeader, SchemaTree} from '../src/types.js'
   */


  /**
   * Read a data page from uncompressed reader.
   *
   * @param {Uint8Array} bytes raw page data (should already be decompressed)
   * @param {DataPageHeader} daph data page header
   * @param {ColumnDecoder} columnDecoder
   * @returns {DataPage} definition levels, repetition levels, and array of values
   */
  function readDataPage(bytes, daph, { type, element, schemaPath }) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const reader = { view, offset: 0 };
    /** @type {DecodedArray} */
    let dataPage;

    // repetition and definition levels
    const repetitionLevels = readRepetitionLevels(reader, daph, schemaPath);
    // assert(!repetitionLevels.length || repetitionLevels.length === daph.num_values)
    const { definitionLevels, numNulls } = readDefinitionLevels(reader, daph, schemaPath);
    // assert(!definitionLevels.length || definitionLevels.length === daph.num_values)

    // read values based on encoding
    const nValues = daph.num_values - numNulls;
    if (daph.encoding === 'PLAIN') {
      dataPage = readPlain(reader, type, nValues, element.type_length);
    } else if (
      daph.encoding === 'PLAIN_DICTIONARY' ||
      daph.encoding === 'RLE_DICTIONARY' ||
      daph.encoding === 'RLE'
    ) {
      const bitWidth = type === 'BOOLEAN' ? 1 : view.getUint8(reader.offset++);
      if (bitWidth) {
        dataPage = new Array(nValues);
        if (type === 'BOOLEAN') {
          readRleBitPackedHybrid(reader, bitWidth, dataPage);
          dataPage = dataPage.map(x => !!x); // convert to boolean
        } else {
          // assert(daph.encoding.endsWith('_DICTIONARY'))
          readRleBitPackedHybrid(reader, bitWidth, dataPage, view.byteLength - reader.offset);
        }
      } else {
        dataPage = new Uint8Array(nValues); // nValue zeroes
      }
    } else if (daph.encoding === 'BYTE_STREAM_SPLIT') {
      dataPage = byteStreamSplit(reader, nValues, type, element.type_length);
    } else if (daph.encoding === 'DELTA_BINARY_PACKED') {
      const int32 = type === 'INT32';
      dataPage = int32 ? new Int32Array(nValues) : new BigInt64Array(nValues);
      deltaBinaryUnpack(reader, nValues, dataPage);
    } else if (daph.encoding === 'DELTA_LENGTH_BYTE_ARRAY') {
      dataPage = new Array(nValues);
      deltaLengthByteArray$1(reader, nValues, dataPage);
    } else {
      throw new Error(`parquet unsupported encoding: ${daph.encoding}`)
    }

    return { definitionLevels, repetitionLevels, dataPage }
  }

  /**
   * @param {DataReader} reader data view for the page
   * @param {DataPageHeader} daph data page header
   * @param {SchemaTree[]} schemaPath
   * @returns {any[]} repetition levels and number of bytes read
   */
  function readRepetitionLevels(reader, daph, schemaPath) {
    if (schemaPath.length > 1) {
      const maxRepetitionLevel = getMaxRepetitionLevel$1(schemaPath);
      if (maxRepetitionLevel) {
        const values = new Array(daph.num_values);
        readRleBitPackedHybrid(reader, bitWidth$1(maxRepetitionLevel), values);
        return values
      }
    }
    return []
  }

  /**
   * @param {DataReader} reader data view for the page
   * @param {DataPageHeader} daph data page header
   * @param {SchemaTree[]} schemaPath
   * @returns {{ definitionLevels: number[], numNulls: number }} definition levels
   */
  function readDefinitionLevels(reader, daph, schemaPath) {
    const maxDefinitionLevel = getMaxDefinitionLevel(schemaPath);
    if (!maxDefinitionLevel) return { definitionLevels: [], numNulls: 0 }

    const definitionLevels = new Array(daph.num_values);
    readRleBitPackedHybrid(reader, bitWidth$1(maxDefinitionLevel), definitionLevels);

    // count nulls
    let numNulls = daph.num_values;
    for (const def of definitionLevels) {
      if (def === maxDefinitionLevel) numNulls--;
    }
    if (numNulls === 0) definitionLevels.length = 0;

    return { definitionLevels, numNulls }
  }

  /**
   * @param {Uint8Array} compressedBytes
   * @param {number} uncompressed_page_size
   * @param {CompressionCodec} codec
   * @param {Compressors | undefined} compressors
   * @returns {Uint8Array}
   */
  function decompressPage(compressedBytes, uncompressed_page_size, codec, compressors) {
    /** @type {Uint8Array} */
    let page;
    const customDecompressor = compressors?.[codec];
    if (codec === 'UNCOMPRESSED') {
      page = compressedBytes;
    } else if (customDecompressor) {
      page = customDecompressor(compressedBytes, uncompressed_page_size);
    } else if (codec === 'SNAPPY') {
      page = new Uint8Array(uncompressed_page_size);
      snappyUncompress(compressedBytes, page);
    } else {
      throw new Error(`parquet unsupported compression codec: ${codec}`)
    }
    if (page?.length !== uncompressed_page_size) {
      throw new Error(`parquet decompressed page length ${page?.length} does not match header ${uncompressed_page_size}`)
    }
    return page
  }


  /**
   * Read a data page from the given Uint8Array.
   *
   * @param {Uint8Array} compressedBytes raw page data
   * @param {PageHeader} ph page header
   * @param {ColumnDecoder} columnDecoder
   * @returns {DataPage} definition levels, repetition levels, and array of values
   */
  function readDataPageV2(compressedBytes, ph, columnDecoder) {
    const view = new DataView(compressedBytes.buffer, compressedBytes.byteOffset, compressedBytes.byteLength);
    const reader = { view, offset: 0 };
    const { type, element, schemaPath, codec, compressors } = columnDecoder;
    const daph2 = ph.data_page_header_v2;
    if (!daph2) throw new Error('parquet data page header v2 is undefined')

    // repetition levels
    const repetitionLevels = readRepetitionLevelsV2(reader, daph2, schemaPath);
    reader.offset = daph2.repetition_levels_byte_length; // readVarInt() => len for boolean v2?

    // definition levels
    const definitionLevels = readDefinitionLevelsV2(reader, daph2, schemaPath);
    // assert(reader.offset === daph2.repetition_levels_byte_length + daph2.definition_levels_byte_length)

    const uncompressedPageSize = ph.uncompressed_page_size - daph2.definition_levels_byte_length - daph2.repetition_levels_byte_length;

    let page = compressedBytes.subarray(reader.offset);
    if (daph2.is_compressed !== false) {
      page = decompressPage(page, uncompressedPageSize, codec, compressors);
    }
    const pageView = new DataView(page.buffer, page.byteOffset, page.byteLength);
    const pageReader = { view: pageView, offset: 0 };

    // read values based on encoding
    /** @type {DecodedArray} */
    let dataPage;
    const nValues = daph2.num_values - daph2.num_nulls;
    if (daph2.encoding === 'PLAIN') {
      dataPage = readPlain(pageReader, type, nValues, element.type_length);
    } else if (daph2.encoding === 'RLE') {
      // assert(type === 'BOOLEAN')
      dataPage = new Array(nValues);
      readRleBitPackedHybrid(pageReader, 1, dataPage);
      dataPage = dataPage.map(x => !!x);
    } else if (
      daph2.encoding === 'PLAIN_DICTIONARY' ||
      daph2.encoding === 'RLE_DICTIONARY'
    ) {
      const bitWidth = pageView.getUint8(pageReader.offset++);
      dataPage = new Array(nValues);
      readRleBitPackedHybrid(pageReader, bitWidth, dataPage, uncompressedPageSize - 1);
    } else if (daph2.encoding === 'DELTA_BINARY_PACKED') {
      const int32 = type === 'INT32';
      dataPage = int32 ? new Int32Array(nValues) : new BigInt64Array(nValues);
      deltaBinaryUnpack(pageReader, nValues, dataPage);
    } else if (daph2.encoding === 'DELTA_LENGTH_BYTE_ARRAY') {
      dataPage = new Array(nValues);
      deltaLengthByteArray$1(pageReader, nValues, dataPage);
    } else if (daph2.encoding === 'DELTA_BYTE_ARRAY') {
      dataPage = new Array(nValues);
      deltaByteArray$1(pageReader, nValues, dataPage);
    } else if (daph2.encoding === 'BYTE_STREAM_SPLIT') {
      dataPage = byteStreamSplit(pageReader, nValues, type, element.type_length);
    } else {
      throw new Error(`parquet unsupported encoding: ${daph2.encoding}`)
    }

    return { definitionLevels, repetitionLevels, dataPage }
  }

  /**
   * @param {DataReader} reader
   * @param {DataPageHeaderV2} daph2 data page header v2
   * @param {SchemaTree[]} schemaPath
   * @returns {any[]} repetition levels
   */
  function readRepetitionLevelsV2(reader, daph2, schemaPath) {
    const maxRepetitionLevel = getMaxRepetitionLevel$1(schemaPath);
    if (!maxRepetitionLevel) return []

    const values = new Array(daph2.num_values);
    readRleBitPackedHybrid(reader, bitWidth$1(maxRepetitionLevel), values, daph2.repetition_levels_byte_length);
    return values
  }

  /**
   * @param {DataReader} reader
   * @param {DataPageHeaderV2} daph2 data page header v2
   * @param {SchemaTree[]} schemaPath
   * @returns {number[] | undefined} definition levels
   */
  function readDefinitionLevelsV2(reader, daph2, schemaPath) {
    const maxDefinitionLevel = getMaxDefinitionLevel(schemaPath);
    if (maxDefinitionLevel) {
      // V2 we know the length
      const values = new Array(daph2.num_values);
      readRleBitPackedHybrid(reader, bitWidth$1(maxDefinitionLevel), values, daph2.definition_levels_byte_length);
      return values
    }
  }

  /**
   * Minimum bits needed to store value.
   *
   * @param {number} value
   * @returns {number}
   */
  function bitWidth$1(value) {
    return 32 - Math.clz32(value)
  }

  /**
   * @import {ColumnDecoder, DataReader, DecodedArray, PageHeader, PageResult, RowGroupSelect, SubColumnData} from '../src/types.js'
   */


  /**
   * Parse column data from a buffer.
   *
   * @param {DataReader} reader
   * @param {RowGroupSelect} rowGroupSelect row group selection
   * @param {ColumnDecoder} columnDecoder column decoder params
   * @param {(chunk: SubColumnData) => void} [onPage] callback for each page
   * @returns {{ data: DecodedArray[], skipped: number }}
   */
  function readColumn(reader, { groupStart, selectStart, selectEnd }, columnDecoder, onPage) {
    const { pathInSchema, schemaPath } = columnDecoder;
    const isFlat = isFlatColumn(schemaPath);
    /** @type {DecodedArray[]} */
    const chunks = [];
    /** @type {DecodedArray | undefined} */
    let dictionary = undefined;
    /** @type {DecodedArray | undefined} */
    let lastChunk = undefined;
    let rowCount = 0;
    let skipped = 0;

    const emitLastChunk = onPage && (() => {
      lastChunk && onPage({
        pathInSchema,
        columnData: lastChunk,
        rowStart: groupStart + rowCount - lastChunk.length,
        rowEnd: groupStart + rowCount,
      });
    });

    while (isFlat ? rowCount < selectEnd : reader.offset < reader.view.byteLength - 1) {
      if (reader.offset >= reader.view.byteLength - 1) break // end of reader

      // read page header
      const header = parquetHeader(reader);
      if (header.type === 'DICTIONARY_PAGE') {
        const { data } = readPage(reader, header, columnDecoder, dictionary, undefined, 0);
        if (data) dictionary = convert(data, columnDecoder);
      } else {
        const lastChunkLength = lastChunk?.length || 0;
        const result = readPage(reader, header, columnDecoder, dictionary, lastChunk, selectStart - rowCount);
        if (result.skipped) {
          // skipped page - just advance row count, don't add to chunks
          if (!chunks.length) {
            skipped += result.skipped;
          }
          rowCount += result.skipped;
        } else if (result.data && lastChunk === result.data) {
          // continued from previous page
          rowCount += result.data.length - lastChunkLength;
        } else if (result.data && result.data.length) {
          emitLastChunk?.();
          chunks.push(result.data);
          rowCount += result.data.length;
          lastChunk = result.data;
        }
      }
    }
    emitLastChunk?.();

    return { data: chunks, skipped }
  }

  /**
   * Read a page (data or dictionary) from a buffer.
   *
   * @param {DataReader} reader
   * @param {PageHeader} header
   * @param {ColumnDecoder} columnDecoder
   * @param {DecodedArray | undefined} dictionary
   * @param {DecodedArray | undefined} previousChunk
   * @param {number} pageStart skip this many rows in the page
   * @returns {PageResult}
   */
  function readPage(reader, header, columnDecoder, dictionary, previousChunk, pageStart) {
    const { type, element, schemaPath, codec, compressors } = columnDecoder;
    // read compressed_page_size bytes
    const compressedBytes = new Uint8Array(
      reader.view.buffer, reader.view.byteOffset + reader.offset, header.compressed_page_size
    );
    reader.offset += header.compressed_page_size;

    // parse page data by type
    if (header.type === 'DATA_PAGE') {
      const daph = header.data_page_header;
      if (!daph) throw new Error('parquet data page header is undefined')

      // skip unnecessary non-nested pages
      if (pageStart > daph.num_values && isFlatColumn(schemaPath)) {
        return { skipped: daph.num_values }
      }

      const page = decompressPage(compressedBytes, Number(header.uncompressed_page_size), codec, compressors);
      const { definitionLevels, repetitionLevels, dataPage } = readDataPage(page, daph, columnDecoder);
      // assert(!daph.statistics?.null_count || daph.statistics.null_count === BigInt(daph.num_values - dataPage.length))

      // convert types, dereference dictionary, and assemble lists
      const values = convertWithDictionary(dataPage, dictionary, daph.encoding, columnDecoder);
      const output = Array.isArray(previousChunk) ? previousChunk : [];
      const assembled = assembleLists(output, definitionLevels, repetitionLevels, values, schemaPath);
      return { skipped: 0, data: assembled }
    } else if (header.type === 'DATA_PAGE_V2') {
      const daph2 = header.data_page_header_v2;
      if (!daph2) throw new Error('parquet data page header v2 is undefined')

      // skip unnecessary pages
      if (pageStart > daph2.num_rows) {
        return { skipped: daph2.num_values }
      }

      const { definitionLevels, repetitionLevels, dataPage } =
        readDataPageV2(compressedBytes, header, columnDecoder);

      // convert types, dereference dictionary, and assemble lists
      const values = convertWithDictionary(dataPage, dictionary, daph2.encoding, columnDecoder);
      const output = Array.isArray(previousChunk) ? previousChunk : [];
      const assembled = assembleLists(output, definitionLevels, repetitionLevels, values, schemaPath);
      return { skipped: 0, data: assembled }
    } else if (header.type === 'DICTIONARY_PAGE') {
      const diph = header.dictionary_page_header;
      if (!diph) throw new Error('parquet dictionary page header is undefined')

      const page = decompressPage(
        compressedBytes, Number(header.uncompressed_page_size), codec, compressors
      );

      const reader = { view: new DataView(page.buffer, page.byteOffset, page.byteLength), offset: 0 };
      const dictArray = readPlain(reader, type, diph.num_values, element.type_length);
      return { skipped: 0, data: dictArray }
    } else {
      throw new Error(`parquet unsupported page type: ${header.type}`)
    }
  }

  /**
   * Read parquet header from a buffer.
   *
   * @param {DataReader} reader
   * @returns {PageHeader}
   */
  function parquetHeader(reader) {
    const header = deserializeTCompactProtocol(reader);

    // Parse parquet header from thrift data
    const type = PageTypes[header.field_1];
    const uncompressed_page_size = header.field_2;
    const compressed_page_size = header.field_3;
    const crc = header.field_4;
    const data_page_header = header.field_5 && {
      num_values: header.field_5.field_1,
      encoding: Encodings[header.field_5.field_2],
      definition_level_encoding: Encodings[header.field_5.field_3],
      repetition_level_encoding: Encodings[header.field_5.field_4],
      statistics: header.field_5.field_5 && {
        max: header.field_5.field_5.field_1,
        min: header.field_5.field_5.field_2,
        null_count: header.field_5.field_5.field_3,
        distinct_count: header.field_5.field_5.field_4,
        max_value: header.field_5.field_5.field_5,
        min_value: header.field_5.field_5.field_6,
      },
    };
    const index_page_header = header.field_6;
    const dictionary_page_header = header.field_7 && {
      num_values: header.field_7.field_1,
      encoding: Encodings[header.field_7.field_2],
      is_sorted: header.field_7.field_3,
    };
    const data_page_header_v2 = header.field_8 && {
      num_values: header.field_8.field_1,
      num_nulls: header.field_8.field_2,
      num_rows: header.field_8.field_3,
      encoding: Encodings[header.field_8.field_4],
      definition_levels_byte_length: header.field_8.field_5,
      repetition_levels_byte_length: header.field_8.field_6,
      is_compressed: header.field_8.field_7 === undefined ? true : header.field_8.field_7, // default true
      statistics: header.field_8.field_8,
    };

    return {
      type,
      uncompressed_page_size,
      compressed_page_size,
      crc,
      data_page_header,
      index_page_header,
      dictionary_page_header,
      data_page_header_v2,
    }
  }

  /**
   * @import {AsyncColumn, AsyncRowGroup, DecodedArray, GroupPlan, ParquetParsers, ParquetReadOptions, QueryPlan, SchemaTree} from '../src/types.js'
   */


  /**
   * Read a row group from a file-like object.
   *
   * @param {ParquetReadOptions} options
   * @param {QueryPlan} plan
   * @param {GroupPlan} groupPlan
   * @returns {AsyncRowGroup} resolves to column data
   */
  function readRowGroup(options, { metadata }, groupPlan) {
    /** @type {AsyncColumn[]} */
    const asyncColumns = [];

    // read column data
    for (const chunk of groupPlan.chunks) {
      const { data_page_offset, dictionary_page_offset, path_in_schema: pathInSchema } = chunk.columnMetadata;
      const schemaPath = getSchemaPath(metadata.schema, pathInSchema);
      const columnDecoder = {
        pathInSchema,
        element: schemaPath[schemaPath.length - 1].element,
        schemaPath,
        parsers: { ...DEFAULT_PARSERS, ...options.parsers },
        ...options,
        ...chunk.columnMetadata,
      };
      let { startByte, endByte } = chunk.range;

      // non-offset-index case
      if (!('offsetIndex' in chunk)) {
        asyncColumns.push({
          pathInSchema,
          data: Promise.resolve(options.file.slice(startByte, endByte))
            .then(buffer => {
              const reader = { view: new DataView(buffer), offset: 0 };
              return readColumn(reader, groupPlan, columnDecoder, options.onPage)
            }),
        });
        continue
      }

      // offset-index case
      asyncColumns.push({
        pathInSchema,
        // fetch offset index
        data: Promise.resolve(options.file.slice(chunk.offsetIndex.startByte, chunk.offsetIndex.endByte))
          .then(async arrayBuffer => {
            // use offset index to read only necessary pages
            const { selectStart, selectEnd } = groupPlan;
            const pages = readOffsetIndex({ view: new DataView(arrayBuffer), offset: 0 }).page_locations;
            let skipped = -1;
            // include dictionary if present, handle polars missing dictionary_page_offset
            const hasDict = dictionary_page_offset || data_page_offset < pages[0].offset;
            for (let i = 0; i < pages.length; i++) {
              const page = pages[i];
              const pageStart = Number(page.first_row_index);
              const pageEnd = i + 1 < pages.length
                ? Number(pages[i + 1].first_row_index)
                : groupPlan.groupRows; // last page extends to end of row group
              // check if page overlaps with [selectStart, selectEnd)
              if (skipped < 0 && !hasDict && pageEnd > selectStart) {
                startByte = Number(page.offset);
                skipped = pageStart;
              }
              if (pageStart < selectEnd) {
                endByte = Number(page.offset) + page.compressed_page_size;
              }
            }
            if (skipped < 0) skipped = 0;
            const buffer = await options.file.slice(startByte, endByte);
            const reader = { view: new DataView(buffer), offset: 0 };
            // adjust row selection for skipped pages
            const adjustedGroupPlan = skipped ? {
              ...groupPlan,
              groupStart: groupPlan.groupStart + skipped,
              selectStart: groupPlan.selectStart - skipped,
              selectEnd: groupPlan.selectEnd - skipped,
            } : groupPlan;
            const { data, skipped: columnSkipped } = readColumn(reader, adjustedGroupPlan, columnDecoder, options.onPage);
            return {
              data,
              skipped: skipped + columnSkipped,
            }
          }),
      });
    }

    return { groupStart: groupPlan.groupStart, groupRows: groupPlan.groupRows, asyncColumns }
  }

  /**
   * @overload
   * @param {AsyncRowGroup} asyncGroup
   * @param {number} selectStart
   * @param {number} selectEnd
   * @param {string[] | undefined} columns
   * @param {'object'} rowFormat
   * @returns {Promise<Record<string, any>[]>} resolves to row data
   */
  /**
   * @overload
   * @param {AsyncRowGroup} asyncGroup
   * @param {number} selectStart
   * @param {number} selectEnd
   * @param {string[] | undefined} columns
   * @param {'array'} [rowFormat]
   * @returns {Promise<any[][]>} resolves to row data
   */
  /**
   * @param {AsyncRowGroup} asyncGroup
   * @param {number} selectStart
   * @param {number} selectEnd
   * @param {string[] | undefined} columns
   * @param {'object' | 'array'} [rowFormat]
   * @returns {Promise<Record<string, any>[] | any[][]>} resolves to row data
   */
  async function asyncGroupToRows({ asyncColumns }, selectStart, selectEnd, columns, rowFormat) {
    // TODO: do it without flatten
    const asyncPages = await Promise.all(asyncColumns.map(column =>
      column.data.then(({ skipped, data }) => ({ skipped, data: flatten(data) }))
    ));

    // transpose columns into rows
    const selectCount = selectEnd - selectStart;
    if (rowFormat === 'object') {
      /** @type {Record<string, any>[]} */
      const groupData = Array(selectCount);
      for (let selectRow = 0; selectRow < selectCount; selectRow++) {
        // return each row as an object
        /** @type {Record<string, any>} */
        const rowData = {};
        for (let i = 0; i < asyncColumns.length; i++) {
          const { data, skipped } = asyncPages[i];
          rowData[asyncColumns[i].pathInSchema[0]] = data[selectStart + selectRow - skipped];
        }
        groupData[selectRow] = rowData;
      }
      return groupData
    }

    // careful mapping of column order for rowFormat: array
    const includedColumnNames = asyncColumns
      .map(child => child.pathInSchema[0])
      .filter(name => !columns || columns.includes(name));
    const columnOrder = columns ?? includedColumnNames;
    const columnIndexes = columnOrder.map(name => asyncColumns.findIndex(column => column.pathInSchema[0] === name));

    /** @type {any[][]} */
    const groupData = Array(selectCount);
    for (let selectRow = 0; selectRow < selectCount; selectRow++) {
      // return each row as an array
      const rowData = Array(asyncColumns.length);
      for (let i = 0; i < columnOrder.length; i++) {
        const colIdx = columnIndexes[i];
        if (colIdx < 0) throw new Error(`parquet column not found: ${columnOrder[i]}`)
        const { data, skipped } = asyncPages[colIdx];
        rowData[i] = data[selectStart + selectRow - skipped];
      }
      groupData[selectRow] = rowData;
    }
    return groupData
  }

  /**
   * Assemble physical columns into top-level columns asynchronously.
   *
   * @param {AsyncRowGroup} asyncRowGroup
   * @param {SchemaTree} schemaTree
   * @param {ParquetParsers} [parsers]
   * @returns {AsyncRowGroup}
   */
  function assembleAsync(asyncRowGroup, schemaTree, parsers) {
    const { asyncColumns } = asyncRowGroup;
    parsers = { ...DEFAULT_PARSERS, ...parsers };
    /** @type {AsyncColumn[]} */
    const assembled = [];
    for (const child of schemaTree.children) {
      if (child.children.length) {
        const childColumns = asyncColumns.filter(column => column.pathInSchema[0] === child.element.name);
        if (!childColumns.length) continue

        assembled.push({
          pathInSchema: child.path,
          data: (async () => {
            // collect subcolumn data
            /** @type {Map<string, DecodedArray>} */
            const subcolumnData = new Map();
            let minLength = Infinity;
            for (const column of childColumns) {
              const { data } = await column.data;
              const flat = flatten(data);
              subcolumnData.set(column.pathInSchema.join('.'), flat);
              minLength = Math.min(minLength, flat.length);
            }
            // trim sub-columns to same length (offset index may read different pages per column)
            for (const [key, value] of subcolumnData) {
              if (value.length > minLength) {
                subcolumnData.set(key, value.slice(0, minLength));
              }
            }
            // assemble the column
            assembleNested(subcolumnData, child, parsers);
            const assembled = subcolumnData.get(child.element.name);
            if (!assembled) throw new Error('parquet column data not assembled')
            return { data: [assembled], skipped: 0 }
          })(),
        });
      } else {
        // leaf node, return the column
        const asyncColumn = asyncColumns.find(column => column.pathInSchema[0] === child.element.name);
        if (asyncColumn) assembled.push(asyncColumn);
      }
    }
    return { ...asyncRowGroup, asyncColumns: assembled }
  }

  /**
   * @import {AsyncRowGroup, DecodedArray, ParquetReadOptions, BaseParquetReadOptions} from '../src/types.js'
   */


  /**
   * Read parquet data rows from a file-like object.
   * Reads the minimal number of row groups and columns to satisfy the request.
   *
   * Returns a void promise when complete.
   * Errors are thrown on the returned promise.
   * Data is returned in callbacks onComplete, onChunk, onPage, NOT the return promise.
   * See parquetReadObjects for a more convenient API.
   *
   * @param {ParquetReadOptions} options read options
   * @returns {Promise<void>} resolves when all requested rows and columns are parsed, all errors are thrown here
   */
  async function parquetRead(options) {
    // load metadata if not provided
    options.metadata ??= await parquetMetadataAsync(options.file, options);

    const { rowStart = 0, rowEnd, columns, onChunk, onComplete, rowFormat, filter, filterStrict = true } = options;

    // Filter requires object format to match column names
    if (filter && rowFormat !== 'object') {
      throw new Error('parquet filter requires rowFormat: "object"')
    }

    // Include filter columns in the read plan
    const filterColumns = columnsNeededForFilter(filter);
    if (filterColumns.length) {
      const schemaColumns = parquetSchema(options.metadata).children.map(c => c.element.name);
      const missingColumns = filterColumns.filter(c => !schemaColumns.includes(c));
      if (missingColumns.length) {
        throw new Error(`parquet filter columns not found: ${missingColumns.join(', ')}`)
      }
    }
    let readColumns = columns;
    let requiresProjection = false;
    if (columns && filter) {
      const missingFilterColumns = filterColumns.filter(c => !columns.includes(c));
      if (missingFilterColumns.length) {
        readColumns = [...columns, ...missingFilterColumns];
        requiresProjection = true;
      }
    }

    // read row groups with expanded columns
    const readOptions = readColumns !== columns ? { ...options, columns: readColumns } : options;
    const asyncGroups = parquetReadAsync(readOptions);

    // skip assembly if no onComplete or onChunk, but wait for reading to finish
    if (!onComplete && !onChunk) {
      for (const { asyncColumns } of asyncGroups) {
        for (const { data } of asyncColumns) await data;
      }
      return
    }

    // assemble struct columns
    const schemaTree = parquetSchema(options.metadata);
    const assembled = asyncGroups.map(arg => assembleAsync(arg, schemaTree, options.parsers));

    // onChunk emit all chunks (don't await)
    if (onChunk) {
      for (const asyncGroup of assembled) {
        for (const asyncColumn of asyncGroup.asyncColumns) {
          asyncColumn.data.then(({ data, skipped }) => {
            let rowStart = asyncGroup.groupStart + skipped;
            for (const columnData of data) {
              onChunk({
                columnName: asyncColumn.pathInSchema[0],
                columnData,
                rowStart,
                rowEnd: rowStart + columnData.length,
              });
              rowStart += columnData.length;
            }
          });
        }
      }
    }

    // onComplete transpose column chunks to rows
    if (onComplete) {
      // loosen the types to avoid duplicate code
      /** @type {any[]} */
      const rows = [];
      for (const asyncGroup of assembled) {
        // filter to rows in range
        const selectStart = Math.max(rowStart - asyncGroup.groupStart, 0);
        const selectEnd = Math.min((rowEnd ?? Infinity) - asyncGroup.groupStart, asyncGroup.groupRows);
        // transpose column chunks to rows in output
        const groupData = rowFormat === 'object' ?
          await asyncGroupToRows(asyncGroup, selectStart, selectEnd, readColumns, 'object') :
          await asyncGroupToRows(asyncGroup, selectStart, selectEnd, columns, 'array');

        // Apply filter and projection
        if (filter) {
          // eslint-disable-next-line no-extra-parens
          for (const row of /** @type {Record<string, any>[]} */ (groupData)) {
            if (matchFilter(row, filter, filterStrict)) {
              if (requiresProjection && columns) {
                for (const col of filterColumns) {
                  if (!columns.includes(col)) delete row[col];
                }
              }
              rows.push(row);
            }
          }
        } else {
          concat(rows, groupData);
        }
      }
      onComplete(rows);
    } else {
      // wait for all async groups to finish (complete takes care of this)
      for (const { asyncColumns } of assembled) {
        for (const { data } of asyncColumns) await data;
      }
    }
  }

  /**
   * @param {ParquetReadOptions} options read options
   * @returns {AsyncRowGroup[]}
   */
  function parquetReadAsync(options) {
    if (!options.metadata) throw new Error('parquet requires metadata')
    // TODO: validate options (start, end, columns, etc)

    // prefetch byte ranges
    const plan = parquetPlan(options);
    options.file = prefetchAsyncBuffer(options.file, plan);

    // read row groups
    return plan.groups.map(groupPlan => readRowGroup(options, plan, groupPlan))
  }

  /**
   * Reads a single column from a parquet file.
   *
   * @param {BaseParquetReadOptions} options
   * @returns {Promise<DecodedArray>}
   */
  async function parquetReadColumn(options) {
    if (options.columns?.length !== 1) {
      throw new Error('parquetReadColumn expected columns: [columnName]')
    }
    options.metadata ??= await parquetMetadataAsync(options.file, options);
    const asyncGroups = parquetReadAsync(options);

    // assemble struct columns
    const schemaTree = parquetSchema(options.metadata);
    const assembled = asyncGroups.map(arg => assembleAsync(arg, schemaTree, options.parsers));

    /** @type {DecodedArray} */
    const columnData = [];
    for (const rg of assembled) {
      const { data } = await rg.asyncColumns[0].data;
      for (const chunk of data) {
        concat(columnData, chunk);
      }
    }
    return columnData
  }

  /**
   * This is a helper function to read parquet row data as a promise.
   * It is a wrapper around the more configurable parquetRead function.
   *
   * @param {Omit<ParquetReadOptions, 'onComplete'>} options
   * @returns {Promise<Record<string, any>[]>} resolves when all requested rows and columns are parsed
   */
  function parquetReadObjects(options) {
    return new Promise((onComplete, reject) => {
      parquetRead({
        ...options,
        rowFormat: 'object', // force object output
        onComplete,
      }).catch(reject);
    })
  }

  /**
   * @import {BaseParquetReadOptions} from '../src/types.js'
   */


  /**
   * Wraps parquetRead with orderBy support.
   * This is a parquet-aware query engine that can read a subset of rows and columns.
   * Accepts optional orderBy column name to sort the results.
   * Note that using orderBy may SIGNIFICANTLY increase the query time.
   *
   * @param {BaseParquetReadOptions & { orderBy?: string }} options
   * @returns {Promise<Record<string, any>[]>} resolves when all requested rows and columns are parsed
   */
  async function parquetQuery(options) {
    if (!options.file || !(options.file.byteLength >= 0)) {
      throw new Error('parquet expected AsyncBuffer')
    }
    options.metadata ??= await parquetMetadataAsync(options.file, options);

    const { metadata, rowStart = 0, columns, orderBy, filter } = options;
    if (rowStart < 0) throw new Error('parquet rowStart must be positive')
    const rowEnd = options.rowEnd ?? Number(metadata.num_rows);

    // Validate orderBy column exists
    if (orderBy) {
      const allColumns = parquetSchema(options.metadata).children.map(c => c.element.name);
      if (!allColumns.includes(orderBy)) {
        throw new Error(`parquet orderBy column not found: ${orderBy}`)
      }
    }

    if (filter && !orderBy && rowEnd < metadata.num_rows) {
      // iterate through row groups and filter until we have enough rows
      /** @type {Record<string, any>[]} */
      const filteredRows = [];
      let groupStart = 0;
      for (const group of metadata.row_groups) {
        const groupEnd = groupStart + Number(group.num_rows);
        // TODO: if expected > group size, start fetching next groups
        const groupData = await parquetReadObjects({
          ...options, rowStart: groupStart, rowEnd: groupEnd,
        });
        filteredRows.push(...groupData);
        if (filteredRows.length >= rowEnd) break
        groupStart = groupEnd;
      }
      return filteredRows.slice(rowStart, rowEnd)
    } else if (filter && orderBy) {
      // read all rows with orderBy column included for sorting
      const readColumns = columns && !columns.includes(orderBy)
        ? [...columns, orderBy]
        : columns;

      const results = await parquetReadObjects({
        ...options, rowStart: undefined, rowEnd: undefined, columns: readColumns,
      });

      // sort by orderBy column
      results.sort((a, b) => compare(a[orderBy], b[orderBy]));

      // project out orderBy column if not originally requested
      if (readColumns !== columns) {
        for (const row of results) {
          delete row[orderBy];
        }
      }

      return results.slice(rowStart, rowEnd)
    } else if (filter) {
      // filter without orderBy, read all matching rows
      const results = await parquetReadObjects({
        ...options, rowStart: undefined, rowEnd: undefined,
      });
      return results.slice(rowStart, rowEnd)
    } else if (typeof orderBy === 'string') {
      // sorted but unfiltered: fetch orderBy column first
      const orderColumn = await parquetReadColumn({
        ...options, rowStart: undefined, rowEnd: undefined, columns: [orderBy],
      });

      // compute row groups to fetch
      const sortedIndices = Array.from(orderColumn, (_, index) => index)
        .sort((a, b) => compare(orderColumn[a], orderColumn[b]))
        .slice(rowStart, rowEnd);

      const sparseData = await parquetReadRows({ ...options, rows: sortedIndices });
      // warning: the type Record<string, any> & {__index__: number})[] is simplified into Record<string, any>[]
      // when returning. The data contains the __index__ property, but it's not exposed as such.
      const data = sortedIndices.map(index => sparseData[index]);
      return data
    } else {
      return await parquetReadObjects(options)
    }
  }

  /**
   * Reads a list rows from a parquet file, reading only the row groups that contain the rows.
   * Returns a sparse array of rows.
   * @param {BaseParquetReadOptions & { rows: number[] }} options
   * @returns {Promise<(Record<string, any> & {__index__: number})[]>}
   */
  async function parquetReadRows(options) {
    const { file, rows } = options;
    options.metadata ??= await parquetMetadataAsync(file, options);
    const { row_groups: rowGroups } = options.metadata;
    // Compute row groups to fetch
    const groupIncluded = Array(rowGroups.length).fill(false);
    let groupStart = 0;
    const groupEnds = rowGroups.map(group => groupStart += Number(group.num_rows));
    for (const index of rows) {
      const groupIndex = groupEnds.findIndex(end => index < end);
      groupIncluded[groupIndex] = true;
    }

    // Compute row ranges to fetch
    const rowRanges = [];
    let rangeStart;
    groupStart = 0;
    for (let i = 0; i < groupIncluded.length; i++) {
      const groupEnd = groupStart + Number(rowGroups[i].num_rows);
      if (groupIncluded[i]) {
        if (rangeStart === undefined) {
          rangeStart = groupStart;
        }
      } else {
        if (rangeStart !== undefined) {
          rowRanges.push([rangeStart, groupEnd]);
          rangeStart = undefined;
        }
      }
      groupStart = groupEnd;
    }
    if (rangeStart !== undefined) {
      rowRanges.push([rangeStart, groupStart]);
    }

    // Fetch by row group and map to rows
    /** @type {(Record<string, any> & {__index__: number})[]} */
    const sparseData = Array(Number(options.metadata.num_rows));
    for (const [rangeStart, rangeEnd] of rowRanges) {
      // TODO: fetch in parallel
      const groupData = await parquetReadObjects({ ...options, rowStart: rangeStart, rowEnd: rangeEnd });
      for (let i = rangeStart; i < rangeEnd; i++) {
        // warning: if the row contains a column named __index__, it will overwrite the index.
        sparseData[i] = { __index__: i, ...groupData[i - rangeStart] };
      }
    }
    return sparseData
  }

  /**
   * @param {any} a
   * @param {any} b
   * @returns {number}
   */
  function compare(a, b) {
    if (a < b) return -1
    if (a > b) return 1
    return 0 // TODO: null handling
  }

  /**
   * Explicitly export types for use in downstream typescript projects through
   * `import { ParquetReadOptions } from 'hyparquet'` for example.
   *
   * @template {any} T
   * @typedef {import('../src/types.d.ts').Awaitable<T>} Awaitable<T>
   */
  /**
   * @typedef {import('../src/types.d.ts').AsyncBuffer} AsyncBuffer
   * @typedef {import('../src/types.d.ts').AsyncRowGroup} AsyncRowGroup
   * @typedef {import('../src/types.d.ts').DataReader} DataReader
   * @typedef {import('../src/types.d.ts').FileMetaData} FileMetaData
   * @typedef {import('../src/types.d.ts').SchemaTree} SchemaTree
   * @typedef {import('../src/types.d.ts').SchemaElement} SchemaElement
   * @typedef {import('../src/types.d.ts').ParquetType} ParquetType
   * @typedef {import('../src/types.d.ts').FieldRepetitionType} FieldRepetitionType
   * @typedef {import('../src/types.d.ts').ConvertedType} ConvertedType
   * @typedef {import('../src/types.d.ts').TimeUnit} TimeUnit
   * @typedef {import('../src/types.d.ts').LogicalType} LogicalType
   * @typedef {import('../src/types.d.ts').RowGroup} RowGroup
   * @typedef {import('../src/types.d.ts').ColumnChunk} ColumnChunk
   * @typedef {import('../src/types.d.ts').ColumnMetaData} ColumnMetaData
   * @typedef {import('../src/types.d.ts').Encoding} Encoding
   * @typedef {import('../src/types.d.ts').CompressionCodec} CompressionCodec
   * @typedef {import('../src/types.d.ts').Compressors} Compressors
   * @typedef {import('../src/types.d.ts').KeyValue} KeyValue
   * @typedef {import('../src/types.d.ts').Statistics} Statistics
   * @typedef {import('../src/types.d.ts').GeospatialStatistics} GeospatialStatistics
   * @typedef {import('../src/types.d.ts').BoundingBox} BoundingBox
   * @typedef {import('../src/types.d.ts').PageType} PageType
   * @typedef {import('../src/types.d.ts').PageHeader} PageHeader
   * @typedef {import('../src/types.d.ts').DataPageHeader} DataPageHeader
   * @typedef {import('../src/types.d.ts').DictionaryPageHeader} DictionaryPageHeader
   * @typedef {import('../src/types.d.ts').DecodedArray} DecodedArray
   * @typedef {import('../src/types.d.ts').OffsetIndex} OffsetIndex
   * @typedef {import('../src/types.d.ts').ColumnIndex} ColumnIndex
   * @typedef {import('../src/types.d.ts').BoundaryOrder} BoundaryOrder
   * @typedef {import('../src/types.d.ts').ColumnData} ColumnData
   * @typedef {import('../src/types.d.ts').SubColumnData} SubColumnData
   * @typedef {import('../src/types.d.ts').ParquetReadOptions} ParquetReadOptions
   * @typedef {import('../src/types.d.ts').MetadataOptions} MetadataOptions
   * @typedef {import('../src/types.d.ts').ParquetParsers} ParquetParsers
   * @typedef {import('../src/types.d.ts').ParquetQueryFilter} ParquetQueryFilter
   */

  var hyparquet = /*#__PURE__*/Object.freeze({
    __proto__: null,
    asyncBufferFromUrl: asyncBufferFromUrl,
    byteLengthFromUrl: byteLengthFromUrl,
    cachedAsyncBuffer: cachedAsyncBuffer,
    flatten: flatten,
    parquetMetadata: parquetMetadata,
    parquetMetadataAsync: parquetMetadataAsync,
    parquetQuery: parquetQuery,
    parquetRead: parquetRead,
    parquetReadObjects: parquetReadObjects,
    parquetSchema: parquetSchema,
    readColumnIndex: readColumnIndex,
    readOffsetIndex: readOffsetIndex,
    snappyUncompress: snappyUncompress,
    toJson: toJson
  });

  /**
   * @import {Writer} from '../src/types.js'
   */

  /**
   * Writes data to an auto-expanding ArrayBuffer.
   *
   * @param {number} [initalSize]
   * @returns {Writer}
   */
  function ByteWriter(initalSize = 1024) {
    this.buffer = new ArrayBuffer(initalSize);
    this.view = new DataView(this.buffer);
    this.offset = 0; // total bytes written
    this.index = 0; // index in buffer (may be reset when flushing to file)
    return this
  }

  /**
   * @param {number} size
   */
  ByteWriter.prototype.ensure = function(size) {
    // auto-expanding buffer
    if (this.index + size > this.buffer.byteLength) {
      const newSize = Math.max(this.buffer.byteLength * 2, this.index + size);
      const newBuffer = new ArrayBuffer(newSize);
      // TODO: save buffers until later and merge once?
      new Uint8Array(newBuffer).set(new Uint8Array(this.buffer));
      this.buffer = newBuffer;
      this.view = new DataView(this.buffer);
    }
  };

  ByteWriter.prototype.finish = function() {
  };

  ByteWriter.prototype.getBuffer = function() {
    return this.buffer.slice(0, this.index)
  };

  ByteWriter.prototype.getBytes = function() {
    return new Uint8Array(this.buffer, 0, this.index)
  };

  /**
   * @param {number} value
   */
  ByteWriter.prototype.appendUint8 = function(value) {
    this.ensure(this.index + 1);
    this.view.setUint8(this.index, value);
    this.offset++;
    this.index++;
  };

  /**
   * @param {number} value
   */
  ByteWriter.prototype.appendUint32 = function(value) {
    this.ensure(this.index + 4);
    this.view.setUint32(this.index, value, true);
    this.offset += 4;
    this.index += 4;
  };

  /**
   * @param {number} value
   */
  ByteWriter.prototype.appendInt32 = function(value) {
    this.ensure(this.index + 4);
    this.view.setInt32(this.index, value, true);
    this.offset += 4;
    this.index += 4;
  };

  /**
   * @param {bigint} value
   */
  ByteWriter.prototype.appendInt64 = function(value) {
    this.ensure(this.index + 8);
    this.view.setBigInt64(this.index, BigInt(value), true);
    this.offset += 8;
    this.index += 8;
  };

  /**
   * @param {number} value
   */
  ByteWriter.prototype.appendFloat32 = function(value) {
    this.ensure(this.index + 8);
    this.view.setFloat32(this.index, value, true);
    this.offset += 4;
    this.index += 4;
  };

  /**
   * @param {number} value
   */
  ByteWriter.prototype.appendFloat64 = function(value) {
    this.ensure(this.index + 8);
    this.view.setFloat64(this.index, value, true);
    this.offset += 8;
    this.index += 8;
  };

  /**
   * @param {ArrayBuffer} value
   */
  ByteWriter.prototype.appendBuffer = function(value) {
    this.appendBytes(new Uint8Array(value));
  };

  /**
   * @param {Uint8Array} value
   */
  ByteWriter.prototype.appendBytes = function(value) {
    this.ensure(this.index + value.length);
    new Uint8Array(this.buffer, this.index, value.length).set(value);
    this.offset += value.length;
    this.index += value.length;
  };

  /**
   * Convert a 32-bit signed integer to varint (1-5 bytes).
   * Writes out groups of 7 bits at a time, setting high bit if more to come.
   *
   * @param {number} value
   */
  ByteWriter.prototype.appendVarInt = function(value) {
    while (true) {
      if ((value & ~0x7f) === 0) {
        // fits in 7 bits
        this.appendUint8(value);
        return
      } else {
        // write 7 bits and set high bit
        this.appendUint8(value & 0x7f | 0x80);
        value >>>= 7;
      }
    }
  };

  /**
   * Convert a bigint to varint (1-10 bytes for 64-bit range).
   *
   * @param {bigint} value
   */
  ByteWriter.prototype.appendVarBigInt = function(value) {
    while (true) {
      if ((value & ~0x7fn) === 0n) {
        // fits in 7 bits
        this.appendUint8(Number(value));
        return
      } else {
        // write 7 bits and set high bit
        this.appendUint8(Number(value & 0x7fn | 0x80n));
        value >>= 7n;
      }
    }
  };

  /**
   * Convert number to zigzag encoding and write as varint.
   *
   * @param {number | bigint} value
   */
  ByteWriter.prototype.appendZigZag = function(value) {
    if (typeof value === 'number') {
      this.appendVarInt(value << 1 ^ value >> 31);
    } else {
      this.appendVarBigInt(value << 1n ^ value >> 63n);
    }
  };

  /**
   * Delta Binary Packed encoding for parquet.
   * Encodes integers as deltas with variable bit-width packing.
   *
   * @import {DecodedArray} from 'hyparquet'
   * @import {Writer} from '../src/types.js'
   */

  const BLOCK_SIZE$1 = 128;
  const MINIBLOCKS_PER_BLOCK = 4;
  const VALUES_PER_MINIBLOCK = BLOCK_SIZE$1 / MINIBLOCKS_PER_BLOCK; // 32

  /**
   * Write values using delta binary packed encoding.
   *
   * @param {Writer} writer
   * @param {DecodedArray} values
   */
  function deltaBinaryPack(writer, values) {
    const count = values.length;
    if (count === 0) {
      // Write header with zero count
      writer.appendVarInt(BLOCK_SIZE$1);
      writer.appendVarInt(MINIBLOCKS_PER_BLOCK);
      writer.appendVarInt(0);
      writer.appendVarInt(0);
      return
    }
    if (typeof values[0] !== 'number' && typeof values[0] !== 'bigint') {
      throw new Error('deltaBinaryPack only supports number or bigint arrays')
    }

    // Write header
    writer.appendVarInt(BLOCK_SIZE$1);
    writer.appendVarInt(MINIBLOCKS_PER_BLOCK);
    writer.appendVarInt(count);
    writer.appendZigZag(values[0]);

    // Process blocks
    let index = 1;
    while (index < count) {
      const blockEnd = Math.min(index + BLOCK_SIZE$1, count);
      const blockSize = blockEnd - index;

      // Compute deltas for this block
      const blockDeltas = new BigInt64Array(blockSize);
      let minDelta = BigInt(values[index]) - BigInt(values[index - 1]);
      blockDeltas[0] = minDelta;
      for (let i = 1; i < blockSize; i++) {
        const delta = BigInt(values[index + i]) - BigInt(values[index + i - 1]);
        blockDeltas[i] = delta;
        if (delta < minDelta) minDelta = delta;
      }
      writer.appendZigZag(minDelta);

      // Calculate bit widths for each miniblock
      const bitWidths = new Uint8Array(MINIBLOCKS_PER_BLOCK);
      for (let mb = 0; mb < MINIBLOCKS_PER_BLOCK; mb++) {
        const mbStart = mb * VALUES_PER_MINIBLOCK;
        const mbEnd = Math.min(mbStart + VALUES_PER_MINIBLOCK, blockSize);

        let maxAdjusted = 0n;
        for (let i = mbStart; i < mbEnd; i++) {
          const adjusted = blockDeltas[i] - minDelta;
          if (adjusted > maxAdjusted) maxAdjusted = adjusted;
        }
        bitWidths[mb] = bitWidth(maxAdjusted);
      }

      // Write bit widths
      writer.appendBytes(bitWidths);

      // Write packed miniblocks
      for (let mb = 0; mb < MINIBLOCKS_PER_BLOCK; mb++) {
        const bitWidth = bitWidths[mb];
        if (bitWidth === 0) continue // No data needed for zero bit width

        const mbStart = mb * VALUES_PER_MINIBLOCK;
        const mbEnd = Math.min(mbStart + VALUES_PER_MINIBLOCK, blockSize);

        // Bit pack the adjusted deltas
        let buffer = 0n;
        let bitsUsed = 0;

        for (let i = 0; i < VALUES_PER_MINIBLOCK; i++) {
          const adjusted = mbStart + i < mbEnd ? blockDeltas[mbStart + i] - minDelta : 0n;
          buffer |= adjusted << BigInt(bitsUsed);
          bitsUsed += bitWidth;

          // Flush complete bytes
          while (bitsUsed >= 8) {
            writer.appendUint8(Number(buffer & 0xffn));
            buffer >>= 8n;
            bitsUsed -= 8;
          }
        }
        // assert(bitsUsed === 0) // because multiple of 8
      }

      index = blockEnd;
    }
  }

  /**
   * Write byte arrays using delta length encoding.
   * Encodes lengths using delta binary packed, then writes raw bytes.
   *
   * @param {Writer} writer
   * @param {DecodedArray} values
   */
  function deltaLengthByteArray(writer, values) {
    // Extract lengths
    const lengths = new Int32Array(values.length);
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      if (!(value instanceof Uint8Array)) {
        throw new Error('deltaLengthByteArray expects Uint8Array values')
      }
      lengths[i] = value.length;
    }

    // Write delta-packed lengths
    deltaBinaryPack(writer, lengths);

    // Write raw byte data
    for (const value of values) {
      writer.appendBytes(value);
    }
  }

  /**
   * Write byte arrays using delta encoding with prefix compression.
   * Stores common prefixes with previous value to improve compression.
   *
   * @param {Writer} writer
   * @param {DecodedArray} values
   */
  function deltaByteArray(writer, values) {
    if (values.length === 0) {
      deltaBinaryPack(writer, []);
      deltaBinaryPack(writer, []);
      return
    }

    // Calculate prefix lengths and suffixes
    const prefixLengths = new Int32Array(values.length);
    const suffixLengths = new Int32Array(values.length);
    /** @type {Uint8Array[]} */
    const suffixes = new Array(values.length);

    // First value has no prefix
    const value = values[0];
    if (!(value instanceof Uint8Array)) {
      throw new Error('deltaByteArray expects Uint8Array values')
    }
    prefixLengths[0] = 0;
    suffixLengths[0] = values[0].length;
    suffixes[0] = values[0];

    for (let i = 1; i < values.length; i++) {
      const prev = values[i - 1];
      const curr = values[i];
      if (!(curr instanceof Uint8Array)) {
        throw new Error('deltaByteArray expects Uint8Array values')
      }

      // Find common prefix length
      let prefixLen = 0;
      const maxPrefix = Math.min(prev.length, curr.length);
      while (prefixLen < maxPrefix && prev[prefixLen] === curr[prefixLen]) {
        prefixLen++;
      }

      prefixLengths[i] = prefixLen;
      suffixLengths[i] = curr.length - prefixLen;
      suffixes[i] = curr.subarray(prefixLen);
    }

    // Write delta-packed prefix lengths
    deltaBinaryPack(writer, prefixLengths);

    // Write delta-packed suffix lengths
    deltaBinaryPack(writer, suffixLengths);

    // Write suffix bytes
    for (const suffix of suffixes) {
      writer.appendBytes(suffix);
    }
  }

  /**
   * Minimum bits needed to store value.
   *
   * @param {bigint} value
   * @returns {number}
   */
  function bitWidth(value) {
    if (value === 0n) return 0
    let bits = 0;
    while (value > 0n) {
      bits++;
      value >>= 1n;
    }
    return bits
  }

  /**
   * @import {DecodedArray} from 'hyparquet'
   * @import {Writer} from '../src/types.js'
   */

  /**
   * @param {Writer} writer
   * @param {DecodedArray} values
   * @param {number} bitWidth
   * @returns {number} bytes written
   */
  function writeRleBitPackedHybrid(writer, values, bitWidth) {
    const offsetStart = writer.offset;
    let pendingBitPackedGroups = 0;
    let bitPackedStart = 0;
    let i = 0;

    while (i < values.length) {
      // Try to write RLE runs of 8+ values
      let rleCount = 1;
      const firstVal = values[i];
      while (i + rleCount < values.length && values[i + rleCount] === firstVal) {
        rleCount++;
      }
      if (rleCount >= 8) {
        // Flush pending bit-packed groups
        if (pendingBitPackedGroups) {
          writeBitPackedGroups(writer, values, bitPackedStart, pendingBitPackedGroups, bitWidth);
          pendingBitPackedGroups = 0;
        }

        // Write RLE run
        writeRleRun(writer, firstVal, rleCount, bitWidth);
        i += rleCount;
      } else {
        // Add to pending bit-packed groups
        if (pendingBitPackedGroups === 0) {
          bitPackedStart = i;
        }
        pendingBitPackedGroups++;
        i += 8;
      }
    }

    // Flush remaining
    if (pendingBitPackedGroups) {
      writeBitPackedGroups(writer, values, bitPackedStart, pendingBitPackedGroups, bitWidth);
    }

    return writer.offset - offsetStart
  }

  /**
   * Write a single RLE run: a repeated value and its count.
   *
   * @param {Writer} writer
   * @param {number} value
   * @param {number} count
   * @param {number} bitWidth
   */
  function writeRleRun(writer, value, count, bitWidth) {
    writer.appendVarInt(count << 1); // rle header
    const width = bitWidth + 7 >> 3;
    for (let j = 0; j < width; j++) {
      writer.appendUint8(value >> (j << 3) & 0xff);
    }
  }

  /**
   * Write consecutive bit-packed groups of 8 values each.
   *
   * @param {Writer} writer
   * @param {DecodedArray} values
   * @param {number} start index of first value
   * @param {number} numGroups number of 8-value groups
   * @param {number} bitWidth
   */
  function writeBitPackedGroups(writer, values, start, numGroups, bitWidth) {
    writer.appendVarInt(numGroups << 1 | 1); // bp header

    if (bitWidth === 0) return

    const mask = (1 << bitWidth) - 1;
    let buffer = 0;
    let bitsUsed = 0;
    const totalValues = numGroups * 8;

    for (let i = 0; i < totalValues; i++) {
      const idx = start + i;
      const v = idx < values.length ? values[idx] & mask : 0;
      buffer |= v << bitsUsed;
      bitsUsed += bitWidth;

      // Flush full bytes
      while (bitsUsed >= 8) {
        writer.appendUint8(buffer & 0xff);
        buffer >>>= 8;
        bitsUsed -= 8;
      }
    }

    // Flush any remaining bits
    if (bitsUsed > 0) {
      writer.appendUint8(buffer & 0xff);
    }
  }

  /**
   * @import {DecodedArray, ParquetType} from 'hyparquet'
   * @import {Writer} from '../src/types.js'
   * @param {Writer} writer
   * @param {DecodedArray} values
   * @param {ParquetType} type
   * @param {number | undefined} fixedLength
   */
  function writePlain(writer, values, type, fixedLength) {
    if (type === 'BOOLEAN') {
      writePlainBoolean(writer, values);
    } else if (type === 'INT32') {
      writePlainInt32(writer, values);
    } else if (type === 'INT64') {
      writePlainInt64(writer, values);
    } else if (type === 'FLOAT') {
      writePlainFloat(writer, values);
    } else if (type === 'DOUBLE') {
      writePlainDouble(writer, values);
    } else if (type === 'BYTE_ARRAY') {
      writePlainByteArray(writer, values);
    } else if (type === 'FIXED_LEN_BYTE_ARRAY') {
      if (!fixedLength) throw new Error('parquet FIXED_LEN_BYTE_ARRAY expected type_length')
      writePlainByteArrayFixed(writer, values, fixedLength);
    } else {
      throw new Error(`parquet unsupported type: ${type}`)
    }
  }

  /**
   * @param {Writer} writer
   * @param {DecodedArray} values
   */
  function writePlainBoolean(writer, values) {
    let currentByte = 0;

    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      if (typeof value !== 'boolean') throw new Error('parquet expected boolean value, got ' + value)
      const bitOffset = i % 8;

      if (value) {
        currentByte |= 1 << bitOffset;
      }

      // once we've packed 8 bits or are at a multiple of 8, we write out the byte
      if (bitOffset === 7) {
        writer.appendUint8(currentByte);
        currentByte = 0;
      }
    }

    // if the array length is not a multiple of 8, write the leftover bits
    if (values.length % 8) {
      writer.appendUint8(currentByte);
    }
  }

  /**
   * @param {Writer} writer
   * @param {DecodedArray} values
   */
  function writePlainInt32(writer, values) {
    for (const value of values) {
      if (!Number.isSafeInteger(value)) throw new Error('parquet expected integer value, got ' + value)
      if (value < -2147483648 || value > 2147483647) throw new Error('parquet expected int32 value, got ' + value)
      writer.appendInt32(value);
    }
  }

  /**
   * @param {Writer} writer
   * @param {DecodedArray} values
   */
  function writePlainInt64(writer, values) {
    for (const value of values) {
      if (typeof value !== 'bigint') throw new Error('parquet expected bigint value, got ' + value)
      writer.appendInt64(value);
    }
  }

  /**
   * @param {Writer} writer
   * @param {DecodedArray} values
   */
  function writePlainFloat(writer, values) {
    for (const value of values) {
      if (typeof value !== 'number') throw new Error('parquet expected number value, got ' + value)
      writer.appendFloat32(value);
    }
  }

  /**
   * @param {Writer} writer
   * @param {DecodedArray} values
   */
  function writePlainDouble(writer, values) {
    for (const value of values) {
      if (typeof value !== 'number') throw new Error('parquet expected number value, got ' + value)
      writer.appendFloat64(value);
    }
  }

  /**
   * @param {Writer} writer
   * @param {DecodedArray} values
   */
  function writePlainByteArray(writer, values) {
    for (const value of values) {
      let bytes = value;
      if (typeof bytes === 'string') {
        // convert string to Uint8Array
        bytes = new TextEncoder().encode(value);
      }
      if (!(bytes instanceof Uint8Array)) {
        throw new Error('parquet expected Uint8Array value, got ' + typeof bytes)
      }
      writer.appendUint32(bytes.length);
      writer.appendBytes(bytes);
    }
  }

  /**
   * @param {Writer} writer
   * @param {DecodedArray} values
   * @param {number} fixedLength
   */
  function writePlainByteArrayFixed(writer, values, fixedLength) {
    for (const value of values) {
      if (!(value instanceof Uint8Array)) throw new Error('parquet expected Uint8Array value, got ' + typeof value)
      if (value.length !== fixedLength) throw new Error(`parquet expected Uint8Array of length ${fixedLength}`)
      writer.appendBytes(value);
    }
  }

  /**
   * @import {ConvertedType, DecodedArray, FieldRepetitionType, ParquetType, SchemaElement} from 'hyparquet'
   * @import {BasicType, ColumnSource} from '../src/types.js'
   */

  /**
   * Infer a schema from column data.
   * Accepts optional schemaOverrides to override the type of columns by name.
   *
   * @param {object} options
   * @param {ColumnSource[]} options.columnData
   * @param {Record<string, SchemaElement>} [options.schemaOverrides]
   * @returns {SchemaElement[]}
   */
  function schemaFromColumnData({ columnData, schemaOverrides }) {
    /** @type {SchemaElement[]} */
    const schema = [{
      name: 'root',
      num_children: columnData.length,
    }];

    for (const { name, data, type, nullable } of columnData) {
      if (schemaOverrides?.[name]) {
        // use schema override
        const override = schemaOverrides[name];
        if (type || nullable !== undefined) {
          throw new Error(`cannot provide both type and schema override for column ${name}`)
        }
        if (override.name !== name) {
          throw new Error(`schema override for column ${name} must have matching name, got ${override.name}`)
        }
        if (override.type === 'FIXED_LEN_BYTE_ARRAY' && !override.type_length) {
          throw new Error('schema override for FIXED_LEN_BYTE_ARRAY must include type_length')
        }
        // TODO: support nested schema overrides
        if (override.num_children) {
          throw new Error('schema override does not support nested types')
        }
        schema.push(override);
      } else if (type) {
        // use provided type
        schema.push(basicTypeToSchemaElement(name, type, nullable));
      } else {
        // auto-detect type from first 1000 values
        schema.push(autoSchemaElement(name, data.slice(0, 1000)));
      }
    }

    return schema
  }

  /**
   * @param {string} name
   * @param {BasicType} type
   * @param {boolean} [nullable]
   * @returns {SchemaElement}
   */
  function basicTypeToSchemaElement(name, type, nullable) {
    const repetition_type = nullable === false ? 'REQUIRED' : 'OPTIONAL';
    if (type === 'STRING') {
      return { name, type: 'BYTE_ARRAY', converted_type: 'UTF8', repetition_type }
    }
    if (type === 'JSON') {
      return { name, type: 'BYTE_ARRAY', converted_type: 'JSON', repetition_type }
    }
    if (type === 'TIMESTAMP') {
      return { name, type: 'INT64', converted_type: 'TIMESTAMP_MILLIS', repetition_type }
    }
    if (type === 'UUID') {
      return { name, type: 'FIXED_LEN_BYTE_ARRAY', type_length: 16, logical_type: { type: 'UUID' }, repetition_type }
    }
    if (type === 'FLOAT16') {
      return { name, type: 'FIXED_LEN_BYTE_ARRAY', type_length: 2, logical_type: { type: 'FLOAT16' }, repetition_type }
    }
    if (type === 'GEOMETRY') {
      return { name, type: 'BYTE_ARRAY', logical_type: { type: 'GEOMETRY' }, repetition_type }
    }
    if (type === 'GEOGRAPHY') {
      return { name, type: 'BYTE_ARRAY', logical_type: { type: 'GEOGRAPHY' }, repetition_type }
    }
    return { name, type, repetition_type }
  }

  /**
   * Automatically determine a SchemaElement from an array of values.
   *
   * @param {string} name the column name
   * @param {DecodedArray} values the column values
   * @returns {SchemaElement}
   */
  function autoSchemaElement(name, values) {
    /** @type {ParquetType | undefined} */
    let type;
    /** @type {FieldRepetitionType} */
    let repetition_type = 'REQUIRED';
    /** @type {ConvertedType | undefined} */
    let converted_type;

    if (values instanceof Int32Array) return { name, type: 'INT32', repetition_type }
    if (values instanceof BigInt64Array) return { name, type: 'INT64', repetition_type }
    if (values instanceof Float32Array) return { name, type: 'FLOAT', repetition_type }
    if (values instanceof Float64Array) return { name, type: 'DOUBLE', repetition_type }

    for (const value of values) {
      if (value === null || value === undefined) {
        repetition_type = 'OPTIONAL';
      } else {
        // value is defined, infer type
        /** @type {ParquetType} */
        let valueType;
        /** @type {ConvertedType | undefined} */
        let valueConvertedType;
        if (typeof value === 'boolean') valueType = 'BOOLEAN';
        else if (typeof value === 'bigint') valueType = 'INT64';
        else if (Number.isInteger(value)) valueType = 'INT32';
        else if (typeof value === 'number') valueType = 'DOUBLE';
        else if (value instanceof Uint8Array) valueType = 'BYTE_ARRAY';
        else if (typeof value === 'string') {
          valueType = 'BYTE_ARRAY';
          valueConvertedType = 'UTF8';
        }
        else if (value instanceof Date) {
          valueType = 'INT64';
          valueConvertedType = 'TIMESTAMP_MILLIS';
        }
        else if (typeof value === 'object') {
          // use json (TODO: native list and object types)
          valueType = 'BYTE_ARRAY';
          valueConvertedType = 'JSON';
        }
        else throw new Error(`cannot determine parquet type for: ${value}`)

        // expand type if necessary
        if (type === undefined) {
          type = valueType;
          converted_type = valueConvertedType;
        } else if (type === 'INT32' && valueType === 'DOUBLE') {
          type = 'DOUBLE';
        } else if (type === 'DOUBLE' && valueType === 'INT32') {
          valueType = 'DOUBLE';
        } else if (type !== valueType || converted_type !== valueConvertedType) {
          throw new Error(`parquet cannot write mixed types: ${converted_type ?? type} and ${valueConvertedType ?? valueType}`)
        }
      }
    }
    if (!type) {
      // fallback to nullable BYTE_ARRAY
      // TODO: logical_type: 'NULL'
      type = 'BYTE_ARRAY';
      repetition_type = 'OPTIONAL';
    }
    return { name, type, repetition_type, converted_type }
  }

  /**
   * Get the max repetition level for a given schema path.
   *
   * @param {SchemaElement[]} schemaPath
   * @returns {number} max repetition level
   */
  function getMaxRepetitionLevel(schemaPath) {
    let maxLevel = 0;
    for (const element of schemaPath) {
      if (element.repetition_type === 'REPEATED') {
        maxLevel++;
      }
    }
    return maxLevel
  }

  /**
   * Write values using BYTE_STREAM_SPLIT encoding.
   * This encoding writes all first bytes of values, then all second bytes, etc.
   * Can improve compression for floating-point and fixed-width numeric data.
   *
   * @import {DecodedArray, ParquetType} from 'hyparquet'
   * @import {Writer} from '../src/types.js'
   * @param {Writer} writer
   * @param {DecodedArray} values
   * @param {ParquetType} type
   * @param {number | undefined} typeLength
   */
  function writeByteStreamSplit(writer, values, type, typeLength) {
    const count = values.length;

    // Get bytes from values based on type
    /** @type {Uint8Array} */
    let bytes;
    /** @type {number} */
    let width;
    if (type === 'FLOAT') {
      const typed = values instanceof Float32Array ? values : new Float32Array(numberArray(values));
      bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
      width = 4;
    } else if (type === 'DOUBLE') {
      const typed = values instanceof Float64Array ? values : new Float64Array(numberArray(values));
      bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
      width = 8;
    } else if (type === 'INT32') {
      const typed = values instanceof Int32Array ? values : new Int32Array(numberArray(values));
      bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
      width = 4;
    } else if (type === 'INT64') {
      const typed = bigIntArray(values);
      bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
      width = 8;
    } else if (type === 'FIXED_LEN_BYTE_ARRAY') {
      if (!typeLength) throw new Error('parquet byte_stream_split missing type_length')
      width = typeLength;
      bytes = new Uint8Array(count * width);
      for (let i = 0; i < count; i++) {
        bytes.set(values[i], i * width);
      }
    } else {
      throw new Error(`parquet byte_stream_split unsupported type: ${type}`)
    }

    // Write bytes in column format (all byte 0 from all values, then byte 1, etc.)
    for (let b = 0; b < width; b++) {
      for (let i = 0; i < count; i++) {
        writer.appendUint8(bytes[i * width + b]);
      }
    }
  }

  /**
   * @param {DecodedArray} values
   * @returns {number[]}
   */
  function numberArray(values) {
    if (Array.isArray(values) && values.every(v => typeof v === 'number')) {
      return values
    }
    throw new Error('Expected number array for BYTE_STREAM_SPLIT encoding')
  }

  /**
   * @param {DecodedArray} values
   * @returns {BigInt64Array}
   */
  function bigIntArray(values) {
    if (values instanceof BigInt64Array) return values
    if (Array.isArray(values) && values.every(v => typeof v === 'bigint')) {
      return new BigInt64Array(values)
    }
    throw new Error('Expected bigint array for BYTE_STREAM_SPLIT encoding')
  }

  /**
   * @import {ThriftType} from 'hyparquet/src/types.js'
   * @import {Writer} from '../src/types.js'
   */

  // TCompactProtocol types
  const STOP = 0;
  const TRUE = 1;
  const FALSE = 2;
  const BYTE = 3;
  const I32 = 5;
  const I64 = 6;
  const DOUBLE = 7;
  const BINARY = 8;
  const LIST = 9;
  const STRUCT = 12;

  /**
   * Serialize a JS object in TCompactProtocol format.
   *
   * Expects keys named like "field_1", "field_2", etc. in ascending order.
   *
   * @param {Writer} writer
   * @param {{ [key: `field_${number}`]: any }} data
   */
  function serializeTCompactProtocol(writer, data) {
    writeElement(writer, STRUCT, data);
  }

  /**
   * Write a single value of a given compact type.
   *
   * @param {Writer} writer
   * @param {number} type
   * @param {ThriftType} value
   */
  function writeElement(writer, type, value) {
    // true/false is stored in the type
    if (type === TRUE) return
    if (type === FALSE) return
    if (type === BYTE && typeof value === 'number') {
      writer.appendUint8(value);
    } else if (type === I32 && typeof value === 'number') {
      writer.appendZigZag(value);
    } else if (type === I64 && typeof value === 'bigint') {
      writer.appendZigZag(value);
    } else if (type === DOUBLE && typeof value === 'number') {
      writer.appendFloat64(value);
    } else if (type === BINARY && typeof value === 'string') {
      // store length as a varint, then raw bytes
      const bytes = new TextEncoder().encode(value);
      writer.appendVarInt(bytes.length);
      writer.appendBytes(bytes);
    } else if (type === BINARY && value instanceof Uint8Array) {
      // store length as a varint, then raw bytes
      writer.appendVarInt(value.byteLength);
      writer.appendBytes(value);
    } else if (type === LIST && Array.isArray(value)) {
      // Guess the element type from the first element
      const elemType = getCompactTypeForList(value);

      // Header: size << 4 | elementType
      if (value.length > 14) {
        writer.appendUint8(15 << 4 | elemType);
        writer.appendVarInt(value.length);
      } else {
        writer.appendUint8(value.length << 4 | elemType);
      }

      if (elemType === FALSE) {
        // Special case for boolean list
        for (const v of value) {
          writer.appendUint8(v ? 1 : 0);
        }
      } else {
        for (const v of value) {
          writeElement(writer, elemType, v);
        }
      }
    } else if (type === STRUCT && typeof value === 'object') {
      // write struct fields
      let lastFid = 0;
      for (const [k, v] of Object.entries(value)) {
        if (v === undefined) continue

        const fid = parseInt(k.replace(/^field_/, ''), 10);
        if (Number.isNaN(fid)) {
          throw new Error(`thrift invalid field name: ${k}. Expected "field_###"`)
        }
        const t = getCompactTypeForValue(v);
        const delta = fid - lastFid;
        if (delta <= 0) {
          throw new Error(`thrift non-monotonic field id: fid=${fid}, lastFid=${lastFid}`)
        }
        if (delta > 15) {
          writer.appendUint8(t);
          writer.appendZigZag(fid);
        } else {
          writer.appendUint8(delta << 4 | t);
        }
        writeElement(writer, t, v);
        lastFid = fid;
      }
      // end struct
      writer.appendUint8(STOP);
    } else {
      throw new Error(`thrift invalid type ${type} for value ${value}`)
    }
  }

  /**
   * Infer type from JS value
   *
   * @param {any} value
   * @returns {number} CompactType
   */
  function getCompactTypeForValue(value) {
    if (value === true) return TRUE
    if (value === false) return FALSE
    if (Number.isInteger(value)) return I32
    if (typeof value === 'number') return DOUBLE
    if (typeof value === 'bigint') return I64
    if (typeof value === 'string') return BINARY
    if (value instanceof Uint8Array) return BINARY
    if (Array.isArray(value)) return LIST
    if (value && typeof value === 'object') return STRUCT
    throw new Error(`Cannot determine thrift compact type for: ${value}`)
  }

  /**
   * Infer type for list elements, expand types as needed
   *
   * @param {any[]} value
   * @returns {number} CompactType
   */
  function getCompactTypeForList(value) {
    let elemType = 0;
    for (const v of value) {
      let t = getCompactTypeForValue(v);
      if (t === TRUE) t = FALSE; // booleans map to FALSE
      if (!elemType) elemType = t; // first element
      if (elemType === DOUBLE && t === I32) t = DOUBLE; // expand int to float
      if (elemType === I32 && t === DOUBLE) elemType = DOUBLE; // expand int to float
      if (t !== elemType) {
        throw new Error(`thrift invalid type for list element: ${v} (expected type ${elemType})`)
      }
    }
    return elemType ?? BYTE // BYTE for empty list
  }

  /**
   * @param {Object} options
   * @param {Writer} options.writer
   * @param {ColumnEncoder} options.column
   * @param {Encoding} options.encoding
   * @param {PageData} options.pageData
   */
  function writeDataPageV2({ writer, column, encoding, pageData }) {
    const { columnName, element, codec, compressors } = column;
    const { type, type_length, repetition_type } = element;

    if (!type) throw new Error(`column ${columnName} cannot determine type`)
    if (repetition_type === 'REPEATED') throw new Error(`column ${columnName} repeated types not supported`)

    // write levels to temp buffer
    const levelWriter = new ByteWriter();
    const {
      definition_levels_byte_length,
      repetition_levels_byte_length,
      num_nulls,
      num_values,
      num_rows,
    } = writeLevels(levelWriter, column, pageData);

    // TODO: skip nulls while writing instead of filtering
    const nonnull = num_nulls ? pageData.values.filter(v => v !== null && v !== undefined) : pageData.values;

    // write page data to temp buffer
    const page = new ByteWriter();
    if (encoding === 'PLAIN') {
      writePlain(page, nonnull, type, type_length);
    } else if (encoding === 'RLE') {
      if (type !== 'BOOLEAN') throw new Error('RLE encoding only supported for BOOLEAN type')
      const rleData = new ByteWriter();
      writeRleBitPackedHybrid(rleData, nonnull, 1);
      page.appendUint32(rleData.offset); // prepend byte length
      page.appendBytes(rleData.getBytes());
    } else if (encoding === 'PLAIN_DICTIONARY' || encoding === 'RLE_DICTIONARY') {
      // find max bitwidth
      let maxValue = 0;
      for (const v of nonnull) if (v > maxValue) maxValue = v;
      const bitWidth = Math.ceil(Math.log2(maxValue + 1));
      page.appendUint8(bitWidth); // prepend bitWidth
      writeRleBitPackedHybrid(page, nonnull, bitWidth);
    } else if (encoding === 'DELTA_BINARY_PACKED') {
      if (type !== 'INT32' && type !== 'INT64') {
        throw new Error('DELTA_BINARY_PACKED encoding only supported for INT32 and INT64 types')
      }
      deltaBinaryPack(page, nonnull);
    } else if (encoding === 'DELTA_LENGTH_BYTE_ARRAY') {
      if (type !== 'BYTE_ARRAY') {
        throw new Error('DELTA_LENGTH_BYTE_ARRAY encoding only supported for BYTE_ARRAY type')
      }
      deltaLengthByteArray(page, nonnull);
    } else if (encoding === 'DELTA_BYTE_ARRAY') {
      if (type !== 'BYTE_ARRAY') {
        throw new Error('DELTA_BYTE_ARRAY encoding only supported for BYTE_ARRAY type')
      }
      deltaByteArray(page, nonnull);
    } else if (encoding === 'BYTE_STREAM_SPLIT') {
      writeByteStreamSplit(page, nonnull, type, type_length);
    } else {
      throw new Error(`parquet unsupported encoding: ${encoding}`)
    }

    // compress page data
    const pageBytes = page.getBytes();
    const compressedBytes = compressors[codec]?.(pageBytes) ?? pageBytes;

    // write page header
    writePageHeader(writer, {
      type: 'DATA_PAGE_V2',
      uncompressed_page_size: levelWriter.offset + page.offset,
      compressed_page_size: levelWriter.offset + compressedBytes.length,
      data_page_header_v2: {
        num_values,
        num_nulls,
        num_rows,
        encoding,
        definition_levels_byte_length,
        repetition_levels_byte_length,
        is_compressed: !!codec,
        // is there benefit to page statistics here?
      },
    });

    // write levels
    writer.appendBytes(levelWriter.getBytes());

    // write page data
    writer.appendBytes(compressedBytes);
  }

  /**
   * @param {Writer} writer
   * @param {PageHeader} header
   */
  function writePageHeader(writer, header) {
    /** @type {ThriftObject} */
    const compact = {
      field_1: PageTypes.indexOf(header.type),
      field_2: header.uncompressed_page_size,
      field_3: header.compressed_page_size,
      field_4: header.crc,
      field_5: header.data_page_header && {
        field_1: header.data_page_header.num_values,
        field_2: Encodings.indexOf(header.data_page_header.encoding),
        field_3: Encodings.indexOf(header.data_page_header.definition_level_encoding),
        field_4: Encodings.indexOf(header.data_page_header.repetition_level_encoding),
        // field_5: header.data_page_header.statistics,
      },
      field_7: header.dictionary_page_header && {
        field_1: header.dictionary_page_header.num_values,
        field_2: Encodings.indexOf(header.dictionary_page_header.encoding),
      },
      field_8: header.data_page_header_v2 && {
        field_1: header.data_page_header_v2.num_values,
        field_2: header.data_page_header_v2.num_nulls,
        field_3: header.data_page_header_v2.num_rows,
        field_4: Encodings.indexOf(header.data_page_header_v2.encoding),
        field_5: header.data_page_header_v2.definition_levels_byte_length,
        field_6: header.data_page_header_v2.repetition_levels_byte_length,
        field_7: header.data_page_header_v2.is_compressed ? undefined : false, // default true
      },
    };
    serializeTCompactProtocol(writer, compact);
  }

  /**
   * @import {DecodedArray, Encoding, PageHeader} from 'hyparquet'
   * @import {ColumnEncoder, PageData, ThriftObject, Writer} from '../src/types.js'
   * @param {Writer} writer
   * @param {ColumnEncoder} column
   * @param {PageData} dataPage
   * @returns {{
   *   definition_levels_byte_length: number
   *   repetition_levels_byte_length: number
   *   num_values: number
   *   num_nulls: number
   *   num_rows: number
   * }}
   */
  function writeLevels(writer, column, dataPage) {
    const { schemaPath } = column;
    const { values, definitionLevels, repetitionLevels, maxDefinitionLevel } = dataPage;
    const num_values = definitionLevels.length || values.length;
    let num_nulls = 0;
    let num_rows = 0;
    if (repetitionLevels.length) {
      for (let i = 0; i < repetitionLevels.length; i++) {
        if (repetitionLevels[i] === 0) num_rows++;
      }
    } else {
      num_rows = values.length;
    }
    if (definitionLevels.length) {
      for (let i = 0; i < definitionLevels.length; i++) {
        if (definitionLevels[i] < maxDefinitionLevel) num_nulls++;
      }
    }

    const maxRepetitionLevel = getMaxRepetitionLevel(schemaPath);
    let repetition_levels_byte_length = 0;
    if (maxRepetitionLevel) {
      const bitWidth = Math.ceil(Math.log2(maxRepetitionLevel + 1));
      repetition_levels_byte_length = writeRleBitPackedHybrid(writer, repetitionLevels, bitWidth);
    }

    let definition_levels_byte_length = 0;
    if (maxDefinitionLevel) {
      const bitWidth = Math.ceil(Math.log2(maxDefinitionLevel + 1));
      definition_levels_byte_length = writeRleBitPackedHybrid(writer, definitionLevels, bitWidth);
    }
    return { definition_levels_byte_length, repetition_levels_byte_length, num_values, num_nulls, num_rows }
  }

  /**
   * Compute geospatial statistics for GEOMETRY and GEOGRAPHY columns.
   *
   * @import {BoundingBox, DecodedArray, Geometry, GeospatialStatistics} from 'hyparquet/src/types.js'
   * @param {DecodedArray} values
   * @returns {GeospatialStatistics | undefined}
   */
  function geospatialStatistics(values) {
    /** @type {Set<number>} */
    const typeCodes = new Set();
    /** @type {Partial<BoundingBox> | undefined} */
    let partial;

    for (const value of values) {
      if (value === null || value === undefined) continue
      if (typeof value !== 'object') {
        throw new Error('geospatial column expects GeoJSON geometries')
      }
      partial = extendBoundsFromGeometry(partial, value);
      typeCodes.add(geometryTypeCodeWithDimension(value));
    }

    // If either the X or Y dimension has no finite values, the bounding box itself is not produced
    /** @type {BoundingBox | undefined} */
    let bbox;
    const { xmin, ymin, xmax, ymax } = partial ?? {};
    if (xmin !== undefined && ymin !== undefined && xmax !== undefined && ymax !== undefined) {
      bbox = { ...partial, xmin, ymin, xmax, ymax };
    }

    if (typeCodes.size || bbox) {
      return {
        bbox,
        // Geospatial type codes of all instances, or an empty list if not known
        geospatial_types: typeCodes.size ? Array.from(typeCodes).sort((a, b) => a - b) : [],
      }
    }
  }

  /**
   * @param {Partial<BoundingBox> | undefined} bbox
   * @param {Geometry} geometry
   * @returns {Partial<BoundingBox> | undefined}
   */
  function extendBoundsFromGeometry(bbox, geometry) {
    if (geometry.type === 'GeometryCollection') {
      for (const child of geometry.geometries || []) {
        bbox = extendBoundsFromGeometry(bbox, child);
      }
      return bbox
    }
    return extendBoundsFromCoordinates(bbox, geometry.coordinates)
  }

  /**
   * Recurse through nested coordinate arrays. At a leaf position [x,y,(z),(m)],
   * each dimension is filtered independently — a NaN/non-finite value in one
   * dimension does not skip the others.
   * @param {Partial<BoundingBox> | undefined} bbox
   * @param {any[]} coordinates
   * @returns {Partial<BoundingBox> | undefined}
   */
  function extendBoundsFromCoordinates(bbox, coordinates) {
    if (typeof coordinates[0] === 'number') {
      // Expand bbox
      bbox = updateAxis(bbox, 'xmin', 'xmax', coordinates[0]);
      bbox = updateAxis(bbox, 'ymin', 'ymax', coordinates[1]);
      if (coordinates.length > 2) bbox = updateAxis(bbox, 'zmin', 'zmax', coordinates[2]);
      if (coordinates.length > 3) bbox = updateAxis(bbox, 'mmin', 'mmax', coordinates[3]);
      return bbox
    }
    for (const child of coordinates) {
      bbox = extendBoundsFromCoordinates(bbox, child);
    }
    return bbox
  }

  /**
   * @param {Partial<BoundingBox> | undefined} bbox
   * @param {'xmin' | 'ymin' | 'zmin' | 'mmin'} minKey
   * @param {'xmax' | 'ymax' | 'zmax' | 'mmax'} maxKey
   * @param {number | undefined} value
   * @returns {Partial<BoundingBox> | undefined}
   */
  function updateAxis(bbox, minKey, maxKey, value) {
    if (value === undefined || !Number.isFinite(value)) return bbox
    if (!bbox) bbox = {};
    const min = bbox[minKey];
    const max = bbox[maxKey];
    if (min === undefined || value < min) bbox[minKey] = value;
    if (max === undefined || value > max) bbox[maxKey] = value;
    return bbox
  }

  /**
   * @param {Geometry} geometry
   * @returns {number}
   */
  function geometryTypeCodeWithDimension(geometry) {
    const base = geometryTypeCodes[geometry.type];
    if (base === undefined) throw new Error(`unknown geometry type: ${geometry.type}`)
    const dim = inferGeometryDimensions$1(geometry);
    if (dim === 2) return base
    if (dim === 3) return base + 1000
    if (dim === 4) return base + 3000
    throw new Error(`unsupported geometry dimensions: ${dim}`)
  }

  const geometryTypeCodes = {
    Point: 1,
    LineString: 2,
    Polygon: 3,
    MultiPoint: 4,
    MultiLineString: 5,
    MultiPolygon: 6,
    GeometryCollection: 7,
  };

  /**
   * Determine the maximum coordinate dimensions for the geometry.
   * @param {Geometry} geometry
   * @returns {number}
   */
  function inferGeometryDimensions$1(geometry) {
    if (geometry.type === 'GeometryCollection') {
      let maxDim = 0;
      for (const child of geometry.geometries || []) {
        maxDim = Math.max(maxDim, inferGeometryDimensions$1(child));
      }
      return maxDim || 2
    }
    return inferCoordinateDimensions$1(geometry.coordinates)
  }

  /**
   * @param {any[]} value
   * @returns {number}
   */
  function inferCoordinateDimensions$1(value) {
    if (!value.length) return 2
    if (typeof value[0] === 'number') return value.length
    let maxDim = 0;
    for (const item of value) {
      maxDim = Math.max(maxDim, inferCoordinateDimensions$1(item));
    }
    return maxDim || 2
  }

  /**
   * @import {Geometry, Position} from 'hyparquet/src/types.js'
   */

  /**
   * Serialize a GeoJSON geometry into ISO WKB.
   *
   * @param {Geometry} geometry
   * @returns {Uint8Array}
   */
  function geojsonToWkb(geometry) {
    const writer = new ByteWriter();
    writeGeometry(writer, geometry);
    return writer.getBytes()
  }

  /**
   * @param {ByteWriter} writer
   * @param {Geometry} geometry
   */
  function writeGeometry(writer, geometry) {
    if (typeof geometry !== 'object') {
      throw new Error('geometry values must be GeoJSON geometries')
    }
    const typeCode = geometryTypeCode(geometry.type);

    // infer dimensions
    const dim = inferGeometryDimensions(geometry);
    let flag = 0;
    if (dim === 3) flag = 1;
    else if (dim === 4) flag = 3;
    else if (dim > 4) throw new Error(`unsupported geometry dimensions: ${dim}`)

    writer.appendUint8(1); // little endian
    writer.appendUint32(typeCode + flag * 1000);

    if (geometry.type === 'Point') {
      writePosition(writer, geometry.coordinates, dim);
    } else if (geometry.type === 'LineString') {
      writeLine(writer, geometry.coordinates, dim);
    } else if (geometry.type === 'Polygon') {
      writer.appendUint32(geometry.coordinates.length);
      for (const ring of geometry.coordinates) {
        writeLine(writer, ring, dim);
      }
    } else if (geometry.type === 'MultiPoint') {
      writer.appendUint32(geometry.coordinates.length);
      for (const coordinates of geometry.coordinates) {
        writeGeometry(writer, { type: 'Point', coordinates });
      }
    } else if (geometry.type === 'MultiLineString') {
      writer.appendUint32(geometry.coordinates.length);
      for (const coordinates of geometry.coordinates) {
        writeGeometry(writer, { type: 'LineString', coordinates });
      }
    } else if (geometry.type === 'MultiPolygon') {
      writer.appendUint32(geometry.coordinates.length);
      for (const coordinates of geometry.coordinates) {
        writeGeometry(writer, { type: 'Polygon', coordinates });
      }
    } else if (geometry.type === 'GeometryCollection') {
      writer.appendUint32(geometry.geometries.length);
      for (const child of geometry.geometries) {
        writeGeometry(writer, child);
      }
    } else {
      throw new Error('unsupported geometry type')
    }
  }

  /**
   * @param {ByteWriter} writer
   * @param {Position} position
   * @param {number} dim
   */
  function writePosition(writer, position, dim) {
    if (position.length < dim) {
      throw new Error('geometry position dimensions mismatch')
    }
    for (let i = 0; i < dim; i++) {
      writer.appendFloat64(position[i]);
    }
  }

  /**
   * @param {ByteWriter} writer
   * @param {Position[]} coordinates
   * @param {number} dim
   */
  function writeLine(writer, coordinates, dim) {
    writer.appendUint32(coordinates.length);
    for (const position of coordinates) {
      writePosition(writer, position, dim);
    }
  }

  /**
   * @param {Geometry['type']} type
   * @returns {number}
   */
  function geometryTypeCode(type) {
    if (type === 'Point') return 1
    if (type === 'LineString') return 2
    if (type === 'Polygon') return 3
    if (type === 'MultiPoint') return 4
    if (type === 'MultiLineString') return 5
    if (type === 'MultiPolygon') return 6
    if (type === 'GeometryCollection') return 7
    throw new Error(`unknown geometry type: ${type}`)
  }

  /**
   * Determine the maximum coordinate dimensions for the geometry.
   *
   * @param {Geometry} geometry
   * @returns {number}
   */
  function inferGeometryDimensions(geometry) {
    if (geometry.type === 'GeometryCollection') {
      let maxDim = 0;
      for (const child of geometry.geometries) {
        maxDim = Math.max(maxDim, inferGeometryDimensions(child));
      }
      return maxDim || 2
    }
    return inferCoordinateDimensions(geometry.coordinates)
  }

  /**
   * @param {any} value
   * @returns {number}
   */
  function inferCoordinateDimensions(value) {
    if (!Array.isArray(value)) return 2
    if (!value.length) return 2
    if (typeof value[0] === 'number') return value.length
    let maxDim = 0;
    for (const item of value) {
      maxDim = Math.max(maxDim, inferCoordinateDimensions(item));
    }
    return maxDim || 2
  }

  /**
   * @import {DecodedArray, SchemaElement, Statistics} from 'hyparquet'
   * @import {MinMaxType} from 'hyparquet/src/types.js'
   * @import {ThriftObject} from '../src/types.js'
   */

  const dayMillis = 86400000; // 1 day in milliseconds

  /**
   * Convert from rich to primitive types.
   *
   * @param {SchemaElement} element
   * @param {DecodedArray} values
   * @returns {DecodedArray}
   */
  function unconvert(element, values) {
    const { type, converted_type: ctype, logical_type: ltype } = element;
    if (ctype === 'DECIMAL') {
      const factor = 10 ** (element.scale || 0);
      return values.map(v => {
        if (v === null || v === undefined) return v
        if (typeof v !== 'number') throw new Error('DECIMAL must be a number')
        return unconvertDecimal(element, BigInt(Math.round(v * factor)))
      })
    }
    if (ctype === 'DATE') {
      return Array.from(values).map(v => {
        if (v instanceof Date) return Math.floor(v.getTime() / dayMillis)
        return v
      })
    }
    if (ctype === 'TIMESTAMP_MILLIS') {
      return Array.from(values).map(v => {
        if (v === null || v === undefined) return v
        if (v instanceof Date) return BigInt(v.getTime())
        return BigInt(v)
      })
    }
    if (ctype === 'TIMESTAMP_MICROS') {
      return Array.from(values).map(v => {
        if (v === null || v === undefined) return v
        if (v instanceof Date) return BigInt(v.getTime() * 1000)
        return BigInt(v)
      })
    }
    if (ctype === 'JSON') {
      if (!Array.isArray(values)) throw new Error('JSON must be an array')
      const encoder = new TextEncoder();
      return values.map(v => v === undefined ? undefined : encoder.encode(JSON.stringify(toJson(v))))
    }
    if (ctype === 'UTF8') {
      if (!Array.isArray(values)) throw new Error('strings must be an array')
      const encoder = new TextEncoder();
      return values.map(v => typeof v === 'string' ? encoder.encode(v) : v)
    }
    if (ctype === 'UINT_32' || ltype?.type === 'INTEGER' && ltype.bitWidth === 32 && !ltype.isSigned) {
      if (values instanceof Uint32Array) return values
      if (values instanceof Int32Array) return new Uint32Array(values.buffer, values.byteOffset, values.length)
      return Array.from(values).map(v => {
        if (v === null || v === undefined) return v
        if (!Number.isSafeInteger(v)) throw new Error('expected integer value, got ' + v)
        if (v < 0 || v > 4294967295) throw new Error('expected uint32 value, got ' + v)
        if (v > 2147483647) return v - 4294967296 // convert to signed range
        return v
      })
    }
    if (ltype?.type === 'FLOAT16') {
      if (type !== 'FIXED_LEN_BYTE_ARRAY') throw new Error('FLOAT16 must be FIXED_LEN_BYTE_ARRAY type')
      if (element.type_length !== 2) throw new Error('FLOAT16 expected type_length to be 2 bytes')
      return Array.from(values).map(unconvertFloat16)
    }
    if (ltype?.type === 'UUID') {
      if (!Array.isArray(values)) throw new Error('UUID must be an array')
      if (type !== 'FIXED_LEN_BYTE_ARRAY') throw new Error('UUID must be FIXED_LEN_BYTE_ARRAY type')
      if (element.type_length !== 16) throw new Error('UUID expected type_length to be 16 bytes')
      return values.map(unconvertUuid)
    }
    if (ltype?.type === 'TIMESTAMP') {
      return Array.from(values).map(v => {
        if (v === null || v === undefined) return v
        if (v instanceof Date) {
          const millis = BigInt(v.getTime());
          if (ltype.unit === 'NANOS') return millis * 1_000_000n
          if (ltype.unit === 'MICROS') return millis * 1_000n
          return millis // MILLIS (default)
        }
        return BigInt(v)
      })
    }
    if (ltype?.type === 'GEOMETRY' || ltype?.type === 'GEOGRAPHY') {
      if (!Array.isArray(values)) throw new Error('geometry must be an array')
      return values.map(v => {
        if (v === null || v === undefined) return v
        return geojsonToWkb(v)
      })
    }
    return values
  }

  /**
   * @param {Uint8Array | string | undefined} value
   * @returns {Uint8Array | undefined}
   */
  function unconvertUuid(value) {
    if (value === undefined || value === null) return
    if (value instanceof Uint8Array) return value
    if (typeof value === 'string') {
      const uuidRegex = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
      if (!uuidRegex.test(value)) {
        throw new Error('UUID must be a valid UUID string')
      }
      value = value.replace(/-/g, '').toLowerCase();
      const bytes = new Uint8Array(16);
      for (let i = 0; i < 16; i++) {
        bytes[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
      }
      return bytes
    }
    throw new Error('UUID must be a string or Uint8Array')
  }

  /**
   * Uncovert from rich type to byte array for metadata statistics.
   *
   * @param {MinMaxType | undefined} value
   * @param {SchemaElement} element
   * @returns {Uint8Array | undefined}
   */
  function unconvertMinMax(value, element) {
    if (value === undefined || value === null) return undefined
    const { type, converted_type } = element;
    if (type === 'BOOLEAN') return new Uint8Array([value ? 1 : 0])
    if (converted_type === 'DECIMAL') {
      if (typeof value !== 'number') throw new Error('DECIMAL must be a number')
      const factor = 10 ** (element.scale || 0);
      const out = unconvertDecimal(element, BigInt(Math.round(value * factor)));
      if (out instanceof Uint8Array) return out
      if (typeof out === 'number') {
        const buffer = new ArrayBuffer(4);
        new DataView(buffer).setFloat32(0, out, true);
        return new Uint8Array(buffer)
      }
      if (typeof out === 'bigint') {
        const buffer = new ArrayBuffer(8);
        new DataView(buffer).setBigInt64(0, out, true);
        return new Uint8Array(buffer)
      }
    }
    if (type === 'BYTE_ARRAY' || type === 'FIXED_LEN_BYTE_ARRAY') {
      // truncate byte arrays to 16 bytes for statistics
      if (value instanceof Uint8Array) return value.slice(0, 16)
      return new TextEncoder().encode(value.toString().slice(0, 16))
    }
    if (type === 'FLOAT' && typeof value === 'number') {
      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setFloat32(0, value, true);
      return new Uint8Array(buffer)
    }
    if (type === 'DOUBLE' && typeof value === 'number') {
      const buffer = new ArrayBuffer(8);
      new DataView(buffer).setFloat64(0, value, true);
      return new Uint8Array(buffer)
    }
    if (type === 'INT32' && typeof value === 'number') {
      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setInt32(0, value, true);
      return new Uint8Array(buffer)
    }
    if (type === 'INT64' && typeof value === 'bigint') {
      const buffer = new ArrayBuffer(8);
      new DataView(buffer).setBigInt64(0, value, true);
      return new Uint8Array(buffer)
    }
    if (type === 'INT32' && converted_type === 'DATE' && value instanceof Date) {
      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setInt32(0, Math.floor(value.getTime() / dayMillis), true);
      return new Uint8Array(buffer)
    }
    if (type === 'INT64' && converted_type === 'TIMESTAMP_MILLIS' && value instanceof Date) {
      const buffer = new ArrayBuffer(8);
      new DataView(buffer).setBigInt64(0, BigInt(value.getTime()), true);
      return new Uint8Array(buffer)
    }
    if (type === 'INT64' && converted_type === 'TIMESTAMP_MICROS' && value instanceof Date) {
      const buffer = new ArrayBuffer(8);
      new DataView(buffer).setBigInt64(0, BigInt(value.getTime() * 1000), true);
      return new Uint8Array(buffer)
    }
    if (type === 'INT64' && element.logical_type?.type === 'TIMESTAMP' && value instanceof Date) {
      const millis = BigInt(value.getTime());
      const { unit } = element.logical_type;
      let bigintValue = millis;
      if (unit === 'NANOS') bigintValue = millis * 1_000_000n;
      else if (unit === 'MICROS') bigintValue = millis * 1_000n;
      const buffer = new ArrayBuffer(8);
      new DataView(buffer).setBigInt64(0, bigintValue, true);
      return new Uint8Array(buffer)
    }
    throw new Error(`unsupported type for statistics: ${type} with value ${value}`)
  }

  /**
   * @param {Statistics} stats
   * @param {SchemaElement} element
   * @returns {ThriftObject}
   */
  function unconvertStatistics(stats, element) {
    return {
      field_1: unconvertMinMax(stats.max, element),
      field_2: unconvertMinMax(stats.min, element),
      field_3: stats.null_count,
      field_4: stats.distinct_count,
      field_5: unconvertMinMax(stats.max_value, element),
      field_6: unconvertMinMax(stats.min_value, element),
      field_7: stats.is_max_value_exact,
      field_8: stats.is_min_value_exact,
    }
  }

  /**
   * @param {SchemaElement} element
   * @param {bigint} value
   * @returns {number | bigint | Uint8Array}
   */
  function unconvertDecimal({ type, type_length }, value) {
    if (type === 'INT32') return Number(value)
    if (type === 'INT64') return value
    if (type === 'FIXED_LEN_BYTE_ARRAY' && !type_length) {
      throw new Error('fixed length byte array type_length is required')
    }
    if (!type_length && !value) return new Uint8Array()

    const bytes = [];
    while (true) {
      // extract the lowest 8 bits
      const byte = Number(value & 0xffn);
      bytes.unshift(byte);
      value >>= 8n;

      if (type_length) {
        if (bytes.length >= type_length) break // fixed length
      } else {
        // for nonnegative: stop when top byte has signBit = 0 AND shifted value == 0n
        // for negative: stop when top byte has signBit = 1 AND shifted value == -1n
        const sign = byte & 0x80;
        if (!sign && value === 0n || sign && value === -1n) {
          break
        }
      }
    }

    return new Uint8Array(bytes)
  }

  /**
   * @param {number | undefined} value
   * @returns {Uint8Array | undefined}
   */
  function unconvertFloat16(value) {
    if (value === undefined || value === null) return
    if (typeof value !== 'number') throw new Error('parquet float16 expected number value')
    if (Number.isNaN(value)) return new Uint8Array([0x00, 0x7e])

    const sign = value < 0 || Object.is(value, -0) ? 1 : 0;
    const abs = Math.abs(value);

    // infinities
    if (!isFinite(abs)) return new Uint8Array([0x00, sign << 7 | 0x7c])

    // ±0
    if (abs === 0) return new Uint8Array([0x00, sign << 7])

    // write as f32 to get raw bits
    const buf = new ArrayBuffer(4);
    new Float32Array(buf)[0] = abs;
    const bits32 = new Uint32Array(buf)[0];

    let exp32 = bits32 >>> 23 & 0xff;
    let mant32 = bits32 & 0x7fffff;

    // convert 32‑bit exponent to unbiased, then to 16‑bit
    exp32 -= 127;

    // handle numbers too small for a normal 16‑bit exponent
    if (exp32 < -14) {
      // sub‑normal: shift mantissa so that result = mant * 2^-14
      const shift = -14 - exp32;
      mant32 = (mant32 | 0x800000) >> shift + 13;

      // round‑to‑nearest‑even
      if (mant32 & 1) mant32 += 1;

      const bits16 = sign << 15 | mant32;
      return new Uint8Array([bits16 & 0xff, bits16 >> 8])
    }

    // overflow
    if (exp32 > 15) return new Uint8Array([0x00, sign << 7 | 0x7c])

    // normal number
    let exp16 = exp32 + 15;
    mant32 = mant32 + 0x1000; // add rounding bit

    // handle mantissa overflow after rounding
    if (mant32 & 0x800000) {
      mant32 = 0;
      if (++exp16 === 31) // became infinity
        return new Uint8Array([0x00, sign << 7 | 0x7c])
    }

    const bits16 = sign << 15 | exp16 << 10 | mant32 >> 13;
    return new Uint8Array([bits16 & 0xff, bits16 >> 8])
  }

  /**
   * @import {ColumnChunk, ColumnIndex, DecodedArray, Encoding, OffsetIndex, ParquetType, Statistics} from 'hyparquet'
   * @import {PageEncodingStats} from 'hyparquet/src/types.js'
   * @import {ColumnEncoder, PageData, Writer} from '../src/types.js'
   */

  /**
   * Write a column chunk to the writer.
   *
   * @param {object} options
   * @param {Writer} options.writer
   * @param {ColumnEncoder} options.column
   * @param {PageData} options.pageData
   * @returns {{ chunk: ColumnChunk, columnIndex?: ColumnIndex, offsetIndex?: OffsetIndex }}
   */
  function writeColumn({ writer, column, pageData }) {
    const { columnName, element, schemaPath, stats, pageSize, encoding: userEncoding } = column;
    const { type, type_length } = element;
    if (!type) throw new Error(`column ${columnName} cannot determine type`)
    const { values, definitionLevels, repetitionLevels, maxDefinitionLevel } = pageData;
    const offsetStart = writer.offset;

    /** @type {Encoding[]} */
    const encodings = [];

    const isGeospatial = element?.logical_type?.type === 'GEOMETRY' || element?.logical_type?.type === 'GEOGRAPHY';

    // Compute statistics
    const statistics = stats ? getStatistics(values) : undefined;
    const geospatial_statistics = stats && isGeospatial ? geospatialStatistics(values) : undefined;

    // dictionary encoding
    /** @type {bigint | undefined} */
    let dictionary_page_offset;
    const { dictionary, indexes } = useDictionary(values, type, type_length, userEncoding, pageSize);

    // Determine encoding and prepare values for writing
    /** @type {Encoding} */
    let encoding;
    /** @type {DecodedArray} */
    let writeValues;
    let writeType = type;
    if (dictionary && indexes) {
      // replace values with dictionary indices
      writeValues = indexes;
      writeType = 'INT32';
      encoding = 'RLE_DICTIONARY';

      // write dictionary page first
      dictionary_page_offset = BigInt(writer.offset);
      const unconverted = unconvert(element, dictionary);
      writeDictionaryPage(writer, column, unconverted);
    } else {
      // unconvert values from rich types to simple
      writeValues = unconvert(element, values);
      encoding = userEncoding ?? (type === 'BOOLEAN' && values.length > 16 ? 'RLE' : 'PLAIN');
    }
    encodings.push(encoding);

    // Split values into pages based on pageSize
    const pageBoundaries = getPageBoundaries(writeValues, writeType, type_length, pageSize);

    // Initialize index structures if requested
    /** @type {ColumnIndex | undefined} */
    const columnIndex = column.columnIndex && pageBoundaries.length > 1 ? {
      null_pages: [],
      min_values: [],
      max_values: [],
      boundary_order: 'UNORDERED',
      null_counts: [],
    } : undefined;
    /** @type {OffsetIndex | undefined} */
    const offsetIndex = column.offsetIndex && pageBoundaries.length > 1 ? {
      page_locations: [],
    } : undefined;

    // Write data pages
    const data_page_offset = BigInt(writer.offset);
    let first_row_index = 0n;
    let prevStart = 0;
    let prevMinValue;
    let prevMaxValue;
    let ascending = true;
    let descending = true;

    for (const { start, end } of pageBoundaries) {
      const pageOffset = writer.offset;

      // Slice into subpage and write levels and data
      const pageChunk = {
        values: writeValues.slice(start, end),
        definitionLevels: definitionLevels.slice(start, end),
        repetitionLevels: repetitionLevels.slice(start, end),
        maxDefinitionLevel,
      };
      writeDataPageV2({ writer, column, encoding, pageData: pageChunk });

      // ColumnIndex construction
      if (columnIndex) {
        const pageValues = values.slice(start, end); // original values not indexes
        const { min_value, max_value, null_count = 0n } = getStatistics(pageValues);

        columnIndex.null_pages.push(null_count === BigInt(end - start)); // all nulls
        // Spec: for all-null pages set "byte[0]"
        columnIndex.min_values.push(unconvertMinMax(min_value, element) ?? new Uint8Array());
        columnIndex.max_values.push(unconvertMinMax(max_value, element) ?? new Uint8Array());
        columnIndex.null_counts?.push(null_count);

        // Track boundary order using original JS values
        if (prevMinValue !== undefined && min_value !== undefined) {
          if (prevMinValue > min_value) ascending = false;
          if (prevMinValue < min_value) descending = false;
        }
        if (prevMaxValue !== undefined && max_value !== undefined) {
          if (prevMaxValue > max_value) ascending = false;
          if (prevMaxValue < max_value) descending = false;
        }
        prevMinValue = min_value;
        prevMaxValue = max_value;
      }

      // OffsetIndex construction
      if (offsetIndex) {
        if (repetitionLevels.length) {
          // Count row boundaries from previous page
          for (let i = prevStart + 1; i <= start; i++) {
            if (repetitionLevels[i] === 0) first_row_index++;
          }
        } else {
          first_row_index = BigInt(start); // Flat column
        }

        offsetIndex.page_locations.push({
          offset: BigInt(pageOffset),
          compressed_page_size: writer.offset - pageOffset,
          first_row_index,
        });
      }

      prevStart = start;
    }

    // Set boundary order after all pages are written
    if (columnIndex) {
      if (ascending) columnIndex.boundary_order = 'ASCENDING';
      else if (descending) columnIndex.boundary_order = 'DESCENDING';
    }

    // Build encoding stats
    /** @type {PageEncodingStats[] | undefined} */
    let encoding_stats;
    if (stats) {
      encoding_stats = [];
      if (dictionary_page_offset !== undefined) {
        encoding_stats.push({ page_type: 'DICTIONARY_PAGE', encoding: 'PLAIN', count: 1 });
      }
      encoding_stats.push({ page_type: 'DATA_PAGE_V2', encoding, count: pageBoundaries.length });
    }

    return {
      chunk: {
        meta_data: {
          type,
          encodings,
          path_in_schema: schemaPath.slice(1).map(s => s.name),
          codec: column.codec ?? 'UNCOMPRESSED',
          num_values: BigInt(values.length),
          total_compressed_size: BigInt(writer.offset - offsetStart),
          total_uncompressed_size: BigInt(writer.offset - offsetStart), // TODO: uncompressed pages + headers
          data_page_offset,
          dictionary_page_offset,
          statistics,
          encoding_stats,
          geospatial_statistics,
        },
        file_offset: BigInt(offsetStart),
      },
      columnIndex,
      offsetIndex,
    }
  }

  /**
   * Get page boundaries based on estimated byte size.
   * TODO: split pages on row boundaries
   *
   * @param {DecodedArray} values
   * @param {ParquetType} type
   * @param {number | undefined} type_length
   * @param {number} pageSize
   * @returns {{start: number, end: number}[]}
   */
  function getPageBoundaries(values, type, type_length, pageSize) {
    // If no pageSize limit, return single page with all values
    if (!pageSize) {
      return [{ start: 0, end: values.length }]
    }

    const boundaries = [];
    let start = 0;
    let accumulatedBytes = 0;

    for (let i = 0; i < values.length; i++) {
      const valueSize = estimateValueSize(values[i], type, type_length);
      accumulatedBytes += valueSize;

      // Check if we should start a new page
      if (accumulatedBytes >= pageSize && i > start) {
        boundaries.push({ start, end: i });
        start = i;
        accumulatedBytes = valueSize;
      }
    }

    // Final page with remaining values
    if (start < values.length) {
      boundaries.push({ start, end: values.length });
    }

    return boundaries
  }

  /**
   * Estimate the byte size of a value for page size calculation.
   *
   * @param {any} value
   * @param {ParquetType} type
   * @param {number} [type_length]
   * @returns {number}
   */
  function estimateValueSize(value, type, type_length) {
    if (value === null || value === undefined) return 0
    if (type === 'BOOLEAN') return 0.125
    if (type === 'INT32' || type === 'FLOAT') return 4
    if (type === 'INT64' || type === 'DOUBLE') return 8
    if (type === 'INT96') return 12
    if (type === 'FIXED_LEN_BYTE_ARRAY') return type_length ?? 0
    if (type === 'BYTE_ARRAY') {
      if (value instanceof Uint8Array) return value.byteLength
      if (typeof value === 'string') return value.length
    }
    return 0
  }

  /**
   * @param {DecodedArray} values
   * @param {ParquetType} type
   * @param {number | undefined} type_length
   * @param {Encoding | undefined} encoding
   * @param {number} pageSize
   * @returns {{ dictionary?: any[], indexes?: number[] }}
   */
  function useDictionary(values, type, type_length, encoding, pageSize) {
    if (encoding && encoding !== 'RLE_DICTIONARY') return {}
    if (type === 'BOOLEAN') return {}

    // uniqueness on a sample
    const sample = values.slice(0, 1000);
    const sampleUnique = new Set(sample).size;
    if (sampleUnique === 0 || sampleUnique / sample.length > 0.5) return {}

    // build dictionary and indexes
    /** @type {Map<any, number>} */
    const unique = new Map();
    /** @type {number[]} */
    const indexes = new Array(values.length);
    let dictSize = 0;
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      if (value === null || value === undefined) continue

      // find index for value in dictionary
      let index = unique.get(value);
      if (index === undefined) {
        // dictionary cannot exceed page size
        dictSize += estimateValueSize(value, type, type_length);
        if (pageSize && dictSize > pageSize) return {}
        index = unique.size;
        unique.set(value, index);
      }
      indexes[i] = index;
    }

    // TODO: sort by frequency?
    return { dictionary: Array.from(unique.keys()), indexes }
  }

  /**
   * @param {Writer} writer
   * @param {ColumnEncoder} column
   * @param {DecodedArray} dictionary
   */
  function writeDictionaryPage(writer, column, dictionary) {
    const { element, codec, compressors } = column;
    const { type, type_length } = element;
    if (!type) throw new Error(`column ${column.columnName} cannot determine type`)

    // write values to temp buffer
    const dictionaryPage = new ByteWriter();
    writePlain(dictionaryPage, dictionary, type, type_length);
    const dictionaryBytes = dictionaryPage.getBytes();

    // compress dictionary page data
    const compressedBytes = compressors[codec]?.(dictionaryBytes) ?? dictionaryBytes;

    // write dictionary page header
    writePageHeader(writer, {
      type: 'DICTIONARY_PAGE',
      uncompressed_page_size: dictionaryBytes.byteLength,
      compressed_page_size: compressedBytes.byteLength,
      dictionary_page_header: {
        num_values: dictionary.length,
        encoding: 'PLAIN',
      },
    });
    writer.appendBytes(compressedBytes);
  }

  /**
   * @param {DecodedArray} values
   * @returns {Statistics}
   */
  function getStatistics(values) {
    let min_value = undefined;
    let max_value = undefined;
    let null_count = 0n;
    for (const value of values) {
      if (value === null || value === undefined) {
        null_count++;
        continue
      }
      if (typeof value === 'object') continue // skip objects
      if (min_value === undefined || value < min_value) min_value = value;
      if (max_value === undefined || value > max_value) max_value = value;
    }
    return { min_value, max_value, null_count }
  }

  /**
   * @import {DecodedArray, SchemaElement, SchemaTree} from 'hyparquet'
   * @import {PageData} from '../src/types.js'
   */

  /**
   * Encode column values into repetition and definition levels following the
   * Dremel algorithm. Returns page data for one subcolumn (leaf node in the schema).
   *
   * @param {SchemaTree[]} treePath schema tree nodes from root to leaf
   * @param {DecodedArray} rows top-level column data
   * @returns {PageData}
   */
  function encodeNestedValues(treePath, rows) {
    const schemaPath = treePath.map(n => n.element);
    if (treePath.length < 2) throw new Error('parquet schema path must include column')

    /** @type {number[]} */
    const definitionLevels = [];
    /** @type {number[]} */
    const repetitionLevels = [];
    const maxDefinitionLevel = getMaxDefinitionLevel(treePath);

    // Flat required columns don't need dremel encoding
    if (treePath.length === 2 && maxDefinitionLevel === 0) {
      return { values: rows, definitionLevels, repetitionLevels, maxDefinitionLevel }
    }

    // Flat optional columns: just compute definition levels
    if (treePath.length === 2 && maxDefinitionLevel === 1) {
      const definitionLevels = new Array(rows.length);
      for (let i = 0; i < rows.length; i++) {
        definitionLevels[i] = rows[i] === null || rows[i] === undefined ? 0 : 1;
      }
      return { values: rows, definitionLevels, repetitionLevels, maxDefinitionLevel }
    }

    // Track repetition depth prior to each level
    const repLevelPrior = new Array(treePath.length);
    let repeatedCount = 0;
    for (let i = 0; i < treePath.length; i++) {
      repLevelPrior[i] = repeatedCount;
      if (schemaPath[i].repetition_type === 'REPEATED') repeatedCount++;
    }

    /** @type {any[]} */
    const values = [];

    for (const row of rows) {
      visit(1, row, 0, 0, false);
    }

    return { values, definitionLevels, repetitionLevels, maxDefinitionLevel }

    /**
     * Recursively walk the schema path, emitting definition/repetition pairs.
     *
     * @param {number} depth index into schemaPath
     * @param {any} value value at the current depth
     * @param {number} defLevel definition level accumulated so far
     * @param {number} repLevel repetition level for the next emitted slot
     * @param {boolean} allowNull whether the current value is allowed to be null
     */
    function visit(depth, value, defLevel, repLevel, allowNull) {
      const element = schemaPath[depth];
      const repetition = element.repetition_type || 'REQUIRED';

      // Leaf node
      if (depth === treePath.length - 1) {
        if (value === null || value === undefined) {
          if (repetition === 'REQUIRED' && !allowNull) {
            throw new Error('parquet required value is undefined')
          }
          definitionLevels.push(defLevel);
        } else {
          definitionLevels.push(repetition === 'REQUIRED' ? defLevel : defLevel + 1);
        }
        repetitionLevels.push(repLevel);
        values.push(value);
        return
      }

      if (repetition === 'REPEATED') {
        if (value === null || value === undefined) {
          if (!allowNull) throw new Error('parquet required value is undefined')
          visit(depth + 1, undefined, defLevel, repLevel, true);
          return
        }
        if (!Array.isArray(value)) {
          throw new Error(`parquet repeated field ${element.name} must be an array`)
        }
        if (!value.length) {
          visit(depth + 1, undefined, defLevel, repLevel, true);
          return
        }
        // For MAP key_value entries, extract the child field (key or value) from each entry
        const isMapEntry = isMapLike(treePath[depth - 1]);
        const childElement = schemaPath[depth + 1];
        for (let i = 0; i < value.length; i++) {
          let childValue = value[i];
          if (isMapEntry && childValue && typeof childValue === 'object' && childElement) {
            childValue = childValue[childElement.name];
          }
          const childRep = i === 0 ? repLevel : repLevelPrior[depth] + 1;
          visit(depth + 1, childValue, defLevel + 1, childRep, false);
        }
        return
      }

      if (repetition === 'OPTIONAL') {
        if (value === null || value === undefined) {
          visit(depth + 1, undefined, defLevel, repLevel, true);
        } else {
          const childValue = getChildValue(depth, value);
          const childIsNull = childValue === null || childValue === undefined;
          // Increment def level if: (1) this is a struct (contributes to def even if child is null),
          // or (2) the child value exists. LIST/MAP wrappers don't increment def level themselves.
          const isLogicalContainer = isListLike(treePath[depth]) || isMapLike(treePath[depth]);
          const isStruct = element.num_children && !element.type && !isLogicalContainer;
          const nextDef = isStruct || !childIsNull ? defLevel + 1 : defLevel;
          visit(depth + 1, childValue, nextDef, repLevel, childIsNull);
        }
        return
      }

      // REQUIRED
      if (value === null || value === undefined) {
        if (!allowNull) throw new Error('parquet required value is undefined')
        visit(depth + 1, undefined, defLevel, repLevel, true);
      } else {
        visit(depth + 1, getChildValue(depth, value), defLevel, repLevel, false);
      }
    }

    /**
     * Select the child value for the next schema element in the path.
     * Normalizes maps to {key, value} entries.
     *
     * @param {number} depth current schema depth
     * @param {any} currentValue current value at this depth
     * @returns {any}
     */
    function getChildValue(depth, currentValue) {
      if (currentValue === null || currentValue === undefined) return undefined
      const child = schemaPath[depth + 1];
      if (!child) return undefined

      // LIST and MAP wrappers
      if (isListLike(treePath[depth])) return currentValue
      if (isMapLike(treePath[depth])) {
        return normalizeMap(currentValue, schemaPath[depth])
      }

      if (typeof currentValue === 'object' && !Array.isArray(currentValue)) {
        return currentValue[child.name]
      }

      throw new Error(`parquet expected struct, got ${currentValue}`)
    }

  }

  /**
   * Normalize a map value to an array of {key, value} entries.
   * Accepts Map, plain object, array of [k, v] pairs, or array of {key, value}.
   *
   * @param {any} value
   * @param {SchemaElement} element
   * @returns {{key: any, value: any}[]}
   */
  function normalizeMap(value, element) {
    if (value instanceof Map) {
      return Array.from(value.entries(), ([k, v]) => ({ key: k, value: v }))
    }
    if (Array.isArray(value)) {
      return value.map(entry => {
        if (entry && typeof entry === 'object' && 'key' in entry && 'value' in entry) {
          return entry
        }
        if (Array.isArray(entry) && entry.length === 2) {
          return { key: entry[0], value: entry[1] }
        }
        throw new Error('parquet map entry must provide key and value')
      })
    }
    if (typeof value === 'object') {
      return Object.entries(value).map(([k, v]) => ({ key: k, value: v }))
    }
    throw new Error(`parquet map field ${element.name} must be Map, array, or object`)
  }

  /**
   * @import {ColumnChunk, ColumnIndex, OffsetIndex} from 'hyparquet'
   * @import {PageIndexes, Writer} from '../src/types.js'
   */

  /**
   * Write ColumnIndex and OffsetIndex for the given columns.
   *
   * @param {Writer} writer
   * @param {PageIndexes[]} pageIndexes
   */
  function writeIndexes(writer, pageIndexes) {
    for (const { chunk, columnIndex } of pageIndexes) {
      writeColumnIndex(writer, chunk, columnIndex);
    }
    for (const { chunk, offsetIndex } of pageIndexes) {
      writeOffsetIndex(writer, chunk, offsetIndex);
    }
  }

  /**
   * @param {Writer} writer
   * @param {ColumnChunk} columnChunk
   * @param {ColumnIndex} [columnIndex]
   */
  function writeColumnIndex(writer, columnChunk, columnIndex) {
    // Page indexes only help when multiple pages
    if (!columnIndex || columnIndex.min_values.length <= 1) return
    const columnIndexOffset = writer.offset;
    serializeTCompactProtocol(writer, {
      field_1: columnIndex.null_pages,
      field_2: columnIndex.min_values,
      field_3: columnIndex.max_values,
      field_4: BoundaryOrders.indexOf(columnIndex.boundary_order),
      field_5: columnIndex.null_counts,
    });
    columnChunk.column_index_offset = BigInt(columnIndexOffset);
    columnChunk.column_index_length = writer.offset - columnIndexOffset;
  }

  /**
   * @param {Writer} writer
   * @param {ColumnChunk} columnChunk
   * @param {OffsetIndex} [offsetIndex]
   */
  function writeOffsetIndex(writer, columnChunk, offsetIndex) {
    // Page indexes only help when multiple pages
    if (!offsetIndex || offsetIndex.page_locations.length <= 1) return
    const offsetIndexOffset = writer.offset;
    serializeTCompactProtocol(writer, {
      field_1: offsetIndex.page_locations.map(p => ({
        field_1: p.offset,
        field_2: p.compressed_page_size,
        field_3: p.first_row_index,
      })),
    });
    columnChunk.offset_index_offset = BigInt(offsetIndexOffset);
    columnChunk.offset_index_length = writer.offset - offsetIndexOffset;
  }

  /**
   * @import {FileMetaData, LogicalType, SchemaElement, TimeUnit} from 'hyparquet'
   * @import {ThriftObject, Writer} from '../src/types.js'
   */

  /**
   * Write Parquet file metadata as thrift.
   *
   * @param {Writer} writer
   * @param {FileMetaData} metadata
   */
  function writeMetadata(writer, metadata) {
    /** @type {ThriftObject} */
    const compact = {
      field_1: metadata.version,
      field_2: metadata.schema.map(element => ({
        field_1: element.type && ParquetTypes.indexOf(element.type),
        field_2: element.type_length,
        field_3: element.repetition_type && FieldRepetitionTypes.indexOf(element.repetition_type),
        field_4: element.name,
        field_5: element.num_children,
        field_6: element.converted_type && ConvertedTypes.indexOf(element.converted_type),
        field_7: element.scale,
        field_8: element.precision,
        field_9: element.field_id,
        field_10: logicalType(element.logical_type),
      })),
      field_3: metadata.num_rows,
      field_4: metadata.row_groups.map(rg => ({
        field_1: rg.columns.map(c => ({
          field_1: c.file_path,
          field_2: c.file_offset,
          field_3: c.meta_data && {
            field_1: ParquetTypes.indexOf(c.meta_data.type),
            field_2: c.meta_data.encodings.map(e => Encodings.indexOf(e)),
            field_3: c.meta_data.path_in_schema,
            field_4: CompressionCodecs.indexOf(c.meta_data.codec),
            field_5: c.meta_data.num_values,
            field_6: c.meta_data.total_uncompressed_size,
            field_7: c.meta_data.total_compressed_size,
            field_8: c.meta_data.key_value_metadata && c.meta_data.key_value_metadata.map(kv => ({
              field_1: kv.key,
              field_2: kv.value,
            })),
            field_9: c.meta_data.data_page_offset,
            field_10: c.meta_data.index_page_offset,
            field_11: c.meta_data.dictionary_page_offset,
            field_12: c.meta_data.statistics && unconvertStatistics(
              c.meta_data.statistics,
              schemaElement(metadata.schema, c.meta_data.path_in_schema)
            ),
            field_13: c.meta_data.encoding_stats && c.meta_data.encoding_stats.map(es => ({
              field_1: PageTypes.indexOf(es.page_type),
              field_2: Encodings.indexOf(es.encoding),
              field_3: es.count,
            })),
            field_14: c.meta_data.bloom_filter_offset,
            field_15: c.meta_data.bloom_filter_length,
            field_16: c.meta_data.size_statistics && {
              field_1: c.meta_data.size_statistics.unencoded_byte_array_data_bytes,
              field_2: c.meta_data.size_statistics.repetition_level_histogram,
              field_3: c.meta_data.size_statistics.definition_level_histogram,
            },
            field_17: c.meta_data.geospatial_statistics && {
              field_1: c.meta_data.geospatial_statistics.bbox && {
                field_1: c.meta_data.geospatial_statistics.bbox.xmin,
                field_2: c.meta_data.geospatial_statistics.bbox.xmax,
                field_3: c.meta_data.geospatial_statistics.bbox.ymin,
                field_4: c.meta_data.geospatial_statistics.bbox.ymax,
                field_5: c.meta_data.geospatial_statistics.bbox.zmin,
                field_6: c.meta_data.geospatial_statistics.bbox.zmax,
                field_7: c.meta_data.geospatial_statistics.bbox.mmin,
                field_8: c.meta_data.geospatial_statistics.bbox.mmax,
              },
              field_2: c.meta_data.geospatial_statistics.geospatial_types,
            },
          },
          field_4: c.offset_index_offset,
          field_5: c.offset_index_length,
          field_6: c.column_index_offset,
          field_7: c.column_index_length,
          // field_8: c.crypto_metadata,
          field_9: c.encrypted_column_metadata,
        })),
        field_2: rg.total_byte_size,
        field_3: rg.num_rows,
        field_4: rg.sorting_columns && rg.sorting_columns.map(sc => ({
          field_1: sc.column_idx,
          field_2: sc.descending,
          field_3: sc.nulls_first,
        })),
        field_5: rg.file_offset,
        field_6: rg.total_compressed_size,
        // field_7: rg.ordinal, // should be int16
      })),
      field_5: metadata.key_value_metadata && metadata.key_value_metadata.map(kv => ({
        field_1: kv.key,
        field_2: kv.value,
      })),
      field_6: metadata.created_by,
    };

    // write metadata as thrift
    const metadataStart = writer.offset;
    serializeTCompactProtocol(writer, compact);
    // write metadata length
    const metadataLength = writer.offset - metadataStart;
    writer.appendUint32(metadataLength);
  }

  /**
   * Resolve schema element for statistics using the stored path.
   *
   * @param {SchemaElement[]} schema
   * @param {string[]} path
   * @returns {SchemaElement}
   */
  function schemaElement(schema, path) {
    const tree = getSchemaPath(schema, path);
    return tree[tree.length - 1].element
  }

  /**
   * @param {LogicalType | undefined} type
   * @returns {ThriftObject | undefined}
   */
  function logicalType(type) {
    if (!type) return
    if (type.type === 'STRING') return { field_1: {} }
    if (type.type === 'MAP') return { field_2: {} }
    if (type.type === 'LIST') return { field_3: {} }
    if (type.type === 'ENUM') return { field_4: {} }
    if (type.type === 'DECIMAL') return { field_5: {
      field_1: type.scale,
      field_2: type.precision,
    } }
    if (type.type === 'DATE') return { field_6: {} }
    if (type.type === 'TIME') return { field_7: {
      field_1: type.isAdjustedToUTC,
      field_2: timeUnit(type.unit),
    } }
    if (type.type === 'TIMESTAMP') return { field_8: {
      field_1: type.isAdjustedToUTC,
      field_2: timeUnit(type.unit),
    } }
    if (type.type === 'INTEGER') return { field_10: {
      field_1: type.bitWidth,
      field_2: type.isSigned,
    } }
    if (type.type === 'NULL') return { field_11: {} }
    if (type.type === 'JSON') return { field_12: {} }
    if (type.type === 'BSON') return { field_13: {} }
    if (type.type === 'UUID') return { field_14: {} }
    if (type.type === 'FLOAT16') return { field_15: {} }
    if (type.type === 'VARIANT') return { field_16: {} }
    if (type.type === 'GEOMETRY') return { field_17: {
      field_1: type.crs,
    } }
    if (type.type === 'GEOGRAPHY') return { field_18: {
      field_1: type.crs,
      field_2: type.algorithm && EdgeInterpolationAlgorithms.indexOf(type.algorithm),
    } }
  }

  /**
   * @param {TimeUnit} unit
   * @returns {ThriftObject}
   */
  function timeUnit(unit) {
    if (unit === 'NANOS') return { field_3: {} }
    if (unit === 'MICROS') return { field_2: {} }
    return { field_1: {} }
  }

  /**
   * The MIT License (MIT)
   * Copyright (c) 2016 Zhipeng Jia
   * https://github.com/zhipeng-jia/snappyjs
   */


  /**
   * @import {Writer} from '../src/types.js'
   */

  const BLOCK_LOG = 16;
  const BLOCK_SIZE = 1 << BLOCK_LOG;

  const MAX_HASH_TABLE_BITS = 14;
  const globalHashTables = new Array(MAX_HASH_TABLE_BITS + 1);

  /**
   * Compress snappy data.
   * Returns Snappy-compressed bytes as Uint8Array.
   *
   * @param {Uint8Array} input - uncompressed data
   * @returns {Uint8Array}
   */
  function snappyCompress(input) {
    const writer = new ByteWriter();
    writer.appendVarInt(input.length); // uncompressed length

    // Process input in 64K blocks
    let pos = 0;
    while (pos < input.length) {
      const fragmentSize = Math.min(input.length - pos, BLOCK_SIZE);
      compressFragment(writer, input, pos, fragmentSize);
      pos += fragmentSize;
    }

    return writer.getBytes()
  }

  /**
   * Hash function used in the reference implementation.
   *
   * @param {number} key
   * @param {number} hashFuncShift
   * @returns {number}
   */
  function hashFunc(key, hashFuncShift) {
    return key * 0x1e35a7bd >>> hashFuncShift
  }

  /**
   * Load a 32-bit little-endian integer from a byte array.
   *
   * @param {Uint8Array} array
   * @param {number} pos
   * @returns {number}
   */
  function load32(array, pos) {
    return (
      array[pos] +
      (array[pos + 1] << 8) +
      (array[pos + 2] << 16) +
      (array[pos + 3] << 24)
    )
  }

  /**
   * Compare two 32-bit sequences for equality.
   *
   * @param {Uint8Array} array
   * @param {number} pos1
   * @param {number} pos2
   * @returns {boolean}
   */
  function equals32(array, pos1, pos2) {
    return (
      array[pos1] === array[pos2] &&
      array[pos1 + 1] === array[pos2 + 1] &&
      array[pos1 + 2] === array[pos2 + 2] &&
      array[pos1 + 3] === array[pos2 + 3]
    )
  }

  /**
   * Emit a literal chunk of data.
   * @param {Writer} writer
   * @param {Uint8Array} input
   * @param {number} ip
   * @param {number} len
   */
  function emitLiteral(writer, input, ip, len) {
    // The first byte(s) encode the literal length
    if (len <= 60) {
      writer.appendUint8(len - 1 << 2);
    } else if (len < 256) {
      writer.appendUint8(60 << 2);
      writer.appendUint8(len - 1);
    } else {
      writer.appendUint8(61 << 2);
      writer.appendUint8(len - 1 & 0xff);
      writer.appendUint8(len - 1 >>> 8);
    }

    // Then copy the literal bytes
    writer.appendBytes(input.subarray(ip, ip + len));
  }

  /**
   * Emit a copy of previous data.
   * @param {Writer} writer
   * @param {number} offset
   * @param {number} len
   */
  function emitCopyLessThan64(writer, offset, len) {
    if (len < 12 && offset < 2048) {
      // Copy 4..11 bytes, offset < 2048
      //    --> [  1   | (len-4)<<2 | (offset>>8)<<5 ]
      writer.appendUint8(1 + (len - 4 << 2) + (offset >>> 8 << 5));
      writer.appendUint8(offset & 0xff);
    } else {
      // Copy len bytes, offset 1..65535
      //    --> [  2   | (len-1)<<2 ]
      writer.appendUint8(2 + (len - 1 << 2));
      writer.appendUint8(offset & 0xff);
      writer.appendUint8(offset >>> 8);
    }
  }

  /**
   * Emit a copy of previous data.
   * @param {Writer} writer
   * @param {number} offset
   * @param {number} len
   */
  function emitCopy(writer, offset, len) {
    // Emit 64-byte copies as long as we can
    while (len >= 68) {
      emitCopyLessThan64(writer, offset, 64);
      len -= 64;
    }
    // Emit one 60-byte copy if needed
    if (len > 64) {
      emitCopyLessThan64(writer, offset, 60);
      len -= 60;
    }
    // Final copy
    emitCopyLessThan64(writer, offset, len);
  }

  /**
   * Compress a fragment of data.
   * @param {Writer} writer
   * @param {Uint8Array} input
   * @param {number} ip
   * @param {number} inputSize
   */
  function compressFragment(writer, input, ip, inputSize) {
    let hashTableBits = 1;
    while (1 << hashTableBits <= inputSize && hashTableBits <= MAX_HASH_TABLE_BITS) {
      hashTableBits++;
    }
    hashTableBits--;
    const hashFuncShift = 32 - hashTableBits;

    // Initialize the hash table
    globalHashTables[hashTableBits] ??= new Uint16Array(1 << hashTableBits);
    const hashTable = globalHashTables[hashTableBits];
    hashTable.fill(0);

    const ipEnd = ip + inputSize;
    let ipLimit;
    const baseIp = ip;
    let nextEmit = ip;

    let hash, nextHash;
    let nextIp, candidate, skip;
    let bytesBetweenHashLookups;
    let base, matched, offset;
    let prevHash, curHash;
    let flag = true;

    const INPUT_MARGIN = 15;
    if (inputSize >= INPUT_MARGIN) {
      ipLimit = ipEnd - INPUT_MARGIN;
      ip++;
      nextHash = hashFunc(load32(input, ip), hashFuncShift);

      while (flag) {
        skip = 32;
        nextIp = ip;
        do {
          ip = nextIp;
          hash = nextHash;
          bytesBetweenHashLookups = skip >>> 5;
          skip++;
          nextIp = ip + bytesBetweenHashLookups;
          if (ip > ipLimit) {
            flag = false;
            break
          }
          nextHash = hashFunc(load32(input, nextIp), hashFuncShift);
          candidate = baseIp + hashTable[hash];
          hashTable[hash] = ip - baseIp;
        } while (!equals32(input, ip, candidate))

        if (!flag) {
          break
        }

        // Emit the literal from `nextEmit` to `ip`
        emitLiteral(writer, input, nextEmit, ip - nextEmit);

        // We found a match. Repeatedly match and emit copies
        do {
          base = ip;
          matched = 4;
          while (
            ip + matched < ipEnd &&
            input[ip + matched] === input[candidate + matched]
          ) {
            matched++;
          }
          ip += matched;
          offset = base - candidate;
          emitCopy(writer, offset, matched);

          nextEmit = ip;
          if (ip >= ipLimit) {
            flag = false;
            break
          }
          prevHash = hashFunc(load32(input, ip - 1), hashFuncShift);
          hashTable[prevHash] = ip - 1 - baseIp;
          curHash = hashFunc(load32(input, ip), hashFuncShift);
          candidate = baseIp + hashTable[curHash];
          hashTable[curHash] = ip - baseIp;
        } while (equals32(input, ip, candidate))

        if (!flag) {
          break
        }

        ip++;
        nextHash = hashFunc(load32(input, ip), hashFuncShift);
      }
    }

    // Emit the last literal (if any)
    if (nextEmit < ipEnd) {
      emitLiteral(writer, input, nextEmit, ipEnd - nextEmit);
    }
  }

  /**
   * @import {ColumnChunk, CompressionCodec, FileMetaData, KeyValue, RowGroup, SchemaElement, SchemaTree} from 'hyparquet'
   * @import {ColumnEncoder, ColumnSource, Compressors, PageIndexes, Writer} from '../src/types.js'
   */

  /**
   * ParquetWriter class allows incremental writing of parquet files.
   *
   * @param {object} options
   * @param {Writer} options.writer
   * @param {SchemaElement[]} options.schema
   * @param {CompressionCodec} [options.codec]
   * @param {Compressors} [options.compressors]
   * @param {boolean} [options.statistics]
   * @param {KeyValue[]} [options.kvMetadata]
   */
  function ParquetWriter({ writer, schema, codec = 'SNAPPY', compressors, statistics = true, kvMetadata }) {
    this.writer = writer;
    this.schema = schema;
    this.codec = codec;
    // Include built-in snappy as fallback
    this.compressors = { SNAPPY: snappyCompress, ...compressors };
    this.statistics = statistics;
    this.kvMetadata = kvMetadata;

    /** @type {RowGroup[]} */
    this.row_groups = [];
    this.num_rows = 0n;

    /** @type {PageIndexes[]} */
    this.pendingIndexes = [];

    // write header PAR1
    this.writer.appendUint32(0x31524150);
  }

  /**
   * Write data to the file.
   * Will split data into row groups of the specified size.
   * Calls writer.flush() (if defined) after each row group; if it returns a
   * Promise, subsequent row groups await it before encoding more data.
   *
   * @param {object} options
   * @param {ColumnSource[]} options.columnData
   * @param {number | number[]} [options.rowGroupSize]
   * @param {number} [options.pageSize]
   * @returns {void | Promise<void>}
   */
  ParquetWriter.prototype.write = function({ columnData, rowGroupSize = [1000, 100000], pageSize = 1048576 }) {
    const columnDataRows = columnData[0]?.data?.length || 0;
    /** @type {Promise<void> | undefined} */
    let pending;
    for (const { groupStartIndex, groupSize } of groupIterator({ columnDataRows, rowGroupSize })) {
      const writeGroup = () => {
        const groupStartOffset = this.writer.offset;
        /** @type {ColumnChunk[]} */
        const columns = [];

        // write columns
        for (let j = 0; j < columnData.length; j++) {
          const { name, data, encoding, columnIndex = false, offsetIndex = true } = columnData[j];

          // Spec: if ColumnIndex is present, OffsetIndex must also be present
          if (columnIndex && !offsetIndex) {
            throw new Error('parquet ColumnIndex cannot be present without OffsetIndex')
          }
          if (data.length !== columnDataRows) {
            throw new Error('parquet columns must have the same length')
          }

          const groupData = data.slice(groupStartIndex, groupStartIndex + groupSize);
          const columnPath = getSchemaPath(this.schema, [name]);
          const leafPaths = getLeafSchemaPaths(columnPath);

          for (const leafPath of leafPaths) {
            const schemaPath = leafPath.map(node => node.element);

            /** @type {ColumnEncoder} */
            const column = {
              columnName: schemaPath.slice(1).map(s => s.name).join('.'),
              element: schemaPath[schemaPath.length - 1],
              schemaPath,
              codec: this.codec,
              compressors: this.compressors,
              stats: this.statistics,
              pageSize,
              columnIndex,
              offsetIndex,
              encoding,
            };

            const pageData = encodeNestedValues(leafPath, groupData);
            const result = writeColumn({
              writer: this.writer,
              column,
              pageData,
            });

            columns.push(result.chunk);
            this.pendingIndexes.push(result);
          }
        }

        this.num_rows += BigInt(groupSize);
        this.row_groups.push({
          columns,
          total_byte_size: BigInt(this.writer.offset - groupStartOffset),
          num_rows: BigInt(groupSize),
        });
        return this.writer.flush?.()
      };
      if (pending) {
        pending = pending.then(writeGroup);
      } else {
        const r = writeGroup();
        if (r) pending = Promise.resolve(r);
      }
    }
    return pending
  };

  /**
   * Finish writing the file.
   *
   * @returns {void | Promise<void>}
   */
  ParquetWriter.prototype.finish = function() {
    // Write all indexes at end of file
    writeIndexes(this.writer, this.pendingIndexes);

    // write metadata
    /** @type {FileMetaData} */
    const metadata = {
      version: 2,
      created_by: 'hyparquet',
      schema: this.schema,
      num_rows: this.num_rows,
      row_groups: this.row_groups,
      metadata_length: 0,
      key_value_metadata: this.kvMetadata,
    };
    // @ts-ignore don't want to actually serialize metadata_length
    delete metadata.metadata_length;
    writeMetadata(this.writer, metadata);

    // write footer PAR1
    this.writer.appendUint32(0x31524150);
    return this.writer.finish()
  };

  /**
   * Create an iterator for row groups based on the specified row group size.
   * If rowGroupSize is an array, it will return groups based on the sizes in the array.
   * When the array runs out, it will continue with the last size.
   *
   * @param {object} options
   * @param {number} options.columnDataRows - Total number of rows in the column data
   * @param {number | number[]} options.rowGroupSize - Size of each row group or an array of sizes
   * @returns {Array<{groupStartIndex: number, groupSize: number}>}
   */
  function groupIterator({ columnDataRows, rowGroupSize }) {
    if (Array.isArray(rowGroupSize) && !rowGroupSize.length) {
      throw new Error('rowGroupSize array cannot be empty')
    }
    const groups = [];
    let groupIndex = 0;
    let groupStartIndex = 0;
    while (groupStartIndex < columnDataRows) {
      const size = Array.isArray(rowGroupSize)
        ? rowGroupSize[Math.min(groupIndex, rowGroupSize.length - 1)]
        : rowGroupSize;
      const groupSize = Math.min(size, columnDataRows - groupStartIndex);
      groups.push({ groupStartIndex, groupSize });
      groupStartIndex += size;
      groupIndex++;
    }
    return groups
  }

  /**
   * Expand a schema path to all primitive leaf nodes under the column.
   *
   * @param {SchemaTree[]} schemaPath
   * @returns {SchemaTree[][]}
   */
  function getLeafSchemaPaths(schemaPath) {
    /** @type {SchemaTree[][]} */
    const leaves = [];
    dfs(schemaPath);
    return leaves

    /**
     * @param {SchemaTree[]} path
     */
    function dfs(path) {
      const node = path[path.length - 1];
      if (!node.children.length) {
        leaves.push(path);
        return
      }
      for (const child of node.children) {
        dfs([...path, child]);
      }
    }
  }

  /**
   * @import {ParquetWriteOptions} from '../src/types.js'
   */

  /**
   * Write data as parquet to a file or stream.
   *
   * @param {ParquetWriteOptions} options
   * @returns {void | Promise<void>}
   */
  function parquetWrite({
    writer,
    columnData,
    schema,
    codec = 'SNAPPY',
    compressors,
    statistics = true,
    rowGroupSize = [1000, 100000],
    kvMetadata,
    pageSize = 1048576,
  }) {
    if (!schema) {
      schema = schemaFromColumnData({ columnData });
    } else if (columnData.some(({ type }) => type)) {
      throw new Error('cannot provide both schema and columnData type')
    } else {
      // TODO: validate schema
    }
    const pq = new ParquetWriter({
      writer,
      schema,
      codec,
      compressors,
      statistics,
      kvMetadata,
    });
    const w = pq.write({
      columnData,
      rowGroupSize,
      pageSize,
    });
    return w ? w.then(() => pq.finish()) : pq.finish()
  }

  /**
   * Write data as parquet to an ArrayBuffer.
   *
   * @param {Omit<ParquetWriteOptions, 'writer'>} options
   * @returns {ArrayBuffer}
   */
  function parquetWriteBuffer(options) {
    const writer = new ByteWriter();
    parquetWrite({ ...options, writer });
    return writer.getBuffer()
  }

  /**
   * @typedef {import('hyparquet').KeyValue} KeyValue
   * @typedef {import('hyparquet').SchemaElement} SchemaElement
   * @typedef {import('../src/types.d.ts').BasicType} BasicType
   * @typedef {import('../src/types.d.ts').ColumnSource} ColumnSource
   * @typedef {import('../src/types.d.ts').ParquetWriteOptions} ParquetWriteOptions
   * @typedef {import('../src/types.d.ts').Writer} Writer
   */

  var hyparquetWriter = /*#__PURE__*/Object.freeze({
    __proto__: null,
    ByteWriter: ByteWriter,
    ParquetWriter: ParquetWriter,
    autoSchemaElement: autoSchemaElement,
    geojsonToWkb: geojsonToWkb,
    parquetWrite: parquetWrite,
    parquetWriteBuffer: parquetWriteBuffer,
    schemaFromColumnData: schemaFromColumnData
  });

  window.modules = window.modules || {};
  window.modules.hyparquet = hyparquet;
  window.modules['hyparquet-writer'] = hyparquetWriter;

})();
