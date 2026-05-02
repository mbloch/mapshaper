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
  function getMaxRepetitionLevel(schemaPath) {
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
  const STOP = 0;
  const TRUE = 1;
  const FALSE = 2;
  const BYTE = 3;
  const I16 = 4;
  const I32 = 5;
  const I64 = 6;
  const DOUBLE = 7;
  const BINARY = 8;
  const LIST = 9;
  const STRUCT = 12;

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
      if (type === STOP) break
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
    case TRUE:
      return true
    case FALSE:
      return false
    case BYTE:
      return reader.view.getInt8(reader.offset++)
    case I16:
    case I32:
      return readZigZag(reader)
    case I64:
      return readZigZagBigInt(reader)
    case DOUBLE: {
      const value = reader.view.getFloat64(reader.offset, true);
      reader.offset += 8;
      return value
    }
    case BINARY: {
      const stringLength = readVarInt(reader);
      const strBytes = new Uint8Array(reader.view.buffer, reader.view.byteOffset + reader.offset, stringLength);
      reader.offset += stringLength;
      return strBytes
    }
    case LIST: {
      const byte = reader.view.getUint8(reader.offset++);
      const elemType = byte & 0x0f;
      let listSize = byte >> 4;
      if (listSize === 15) {
        listSize = readVarInt(reader);
      }
      const boolType = elemType === TRUE || elemType === FALSE;
      const values = new Array(listSize);
      for (let i = 0; i < listSize; i++) {
        values[i] = boolType ? readElement(reader, BYTE) === 1 : readElement(reader, elemType);
      }
      return values
    }
    case STRUCT:
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
      logical_type: logicalType(field.field_10),
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
  function logicalType(logicalType) {
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
      unit: timeUnit(logicalType.field_7.field_2),
    }
    if (logicalType?.field_8) return {
      type: 'TIMESTAMP',
      isAdjustedToUTC: logicalType.field_8.field_1,
      unit: timeUnit(logicalType.field_8.field_2),
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
  function timeUnit(unit) {
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
  function deltaLengthByteArray(reader, count, output) {
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
  function deltaByteArray(reader, count, output) {
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
      deltaLengthByteArray(reader, nValues, dataPage);
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
      const maxRepetitionLevel = getMaxRepetitionLevel(schemaPath);
      if (maxRepetitionLevel) {
        const values = new Array(daph.num_values);
        readRleBitPackedHybrid(reader, bitWidth(maxRepetitionLevel), values);
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
    readRleBitPackedHybrid(reader, bitWidth(maxDefinitionLevel), definitionLevels);

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
      deltaLengthByteArray(pageReader, nValues, dataPage);
    } else if (daph2.encoding === 'DELTA_BYTE_ARRAY') {
      dataPage = new Array(nValues);
      deltaByteArray(pageReader, nValues, dataPage);
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
    const maxRepetitionLevel = getMaxRepetitionLevel(schemaPath);
    if (!maxRepetitionLevel) return []

    const values = new Array(daph2.num_values);
    readRleBitPackedHybrid(reader, bitWidth(maxRepetitionLevel), values, daph2.repetition_levels_byte_length);
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
      readRleBitPackedHybrid(reader, bitWidth(maxDefinitionLevel), values, daph2.definition_levels_byte_length);
      return values
    }
  }

  /**
   * Minimum bits needed to store value.
   *
   * @param {number} value
   * @returns {number}
   */
  function bitWidth(value) {
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

  window.modules = window.modules || {};
  window.modules.hyparquet = hyparquet;

})();
