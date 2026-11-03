// A minimal TIFF/GeoTIFF encoder, used by -o format=geotiff.
//
// This is hand-rolled rather than delegating to the geotiff dependency, whose
// writer silently corrupts signed integer samples (its type table omits
// Int8/16/32Array, so it falls back to writing 64-bit floats while the tags
// still declare integer samples), tags data as Deflate without compressing it,
// and builds its IFD in a fixed 1000-byte buffer that long ASCII tags overrun.
//
// Output is a classic (32-bit) little-endian TIFF with band-interleaved,
// strip-based data, which is what our grids already look like in memory.

import { deflateSync } from '../io/mapshaper-gzip';
import { error } from '../utils/mapshaper-logging';

var TIFF_TYPES = {
  ASCII: 2,
  SHORT: 3,
  LONG: 4,
  DOUBLE: 12
};

var TYPE_SIZES = {
  2: 1,
  3: 2,
  4: 4,
  12: 8
};

// Baseline tags, plus the GeoTIFF and GDAL extensions we need. Tags must appear
// in the IFD in ascending numeric order.
var TAGS = {
  ImageWidth: 256,
  ImageLength: 257,
  BitsPerSample: 258,
  Compression: 259,
  PhotometricInterpretation: 262,
  StripOffsets: 273,
  SamplesPerPixel: 277,
  RowsPerStrip: 278,
  StripByteCounts: 279,
  PlanarConfiguration: 284,
  Software: 305,
  ExtraSamples: 338,
  SampleFormat: 339,
  ModelPixelScale: 33550,
  ModelTiepoint: 33922,
  GeoKeyDirectory: 34735,
  GeoDoubleParams: 34736,
  GDAL_METADATA: 42112,
  GDAL_NODATA: 42113
};

// The geo keys this writer knows how to emit, each with its id and its value
// type. A key's type is fixed by the GeoTIFF spec: the short-valued keys hold
// codes and the double-valued ones hold measurements, in degrees or in the
// projection's linear units.
var GEO_KEYS = {
  GTModelTypeGeoKey: [1024, 'short'],
  GTRasterTypeGeoKey: [1025, 'short'],
  GeographicTypeGeoKey: [2048, 'short'],
  GeogGeodeticDatumGeoKey: [2050, 'short'],
  GeogAngularUnitsGeoKey: [2054, 'short'],
  GeogEllipsoidGeoKey: [2056, 'short'],
  GeogSemiMajorAxisGeoKey: [2057, 'double'],
  GeogSemiMinorAxisGeoKey: [2058, 'double'],
  GeogInvFlatteningGeoKey: [2059, 'double'],
  GeogPrimeMeridianLongGeoKey: [2061, 'double'],
  ProjectedCSTypeGeoKey: [3072, 'short'],
  ProjectionGeoKey: [3074, 'short'],
  ProjCoordTransGeoKey: [3075, 'short'],
  ProjLinearUnitsGeoKey: [3076, 'short'],
  ProjLinearUnitSizeGeoKey: [3077, 'double'],
  ProjStdParallel1GeoKey: [3078, 'double'],
  ProjStdParallel2GeoKey: [3079, 'double'],
  ProjNatOriginLongGeoKey: [3080, 'double'],
  ProjNatOriginLatGeoKey: [3081, 'double'],
  ProjFalseEastingGeoKey: [3082, 'double'],
  ProjFalseNorthingGeoKey: [3083, 'double'],
  ProjFalseOriginLongGeoKey: [3084, 'double'],
  ProjFalseOriginLatGeoKey: [3085, 'double'],
  ProjFalseOriginEastingGeoKey: [3086, 'double'],
  ProjFalseOriginNorthingGeoKey: [3087, 'double'],
  ProjCenterLongGeoKey: [3088, 'double'],
  ProjCenterLatGeoKey: [3089, 'double'],
  ProjScaleAtNatOriginGeoKey: [3092, 'double'],
  ProjScaleAtCenterGeoKey: [3093, 'double'],
  ProjAzimuthAngleGeoKey: [3094, 'double'],
  ProjStraightVertPoleLongGeoKey: [3095, 'double'],
  ProjRectifiedGridAngleGeoKey: [3096, 'double'],
  VerticalCSTypeGeoKey: [4096, 'short'],
  VerticalUnitsGeoKey: [4099, 'short']
};

var COMPRESSION_NONE = 1;
var COMPRESSION_DEFLATE = 8;
var PHOTOMETRIC_BLACK_IS_ZERO = 1;
var PHOTOMETRIC_RGB = 2;
var PLANAR_CONFIG_CHUNKY = 1; // band-interleaved, matching grid.samples
var EXTRA_SAMPLE_UNSPECIFIED = 0;
var EXTRA_SAMPLE_UNASSOCIATED_ALPHA = 2;
var SAMPLE_FORMAT_UINT = 1;
var SAMPLE_FORMAT_INT = 2;
var SAMPLE_FORMAT_FLOAT = 3;

// Rows are grouped into strips of about this size, so that a large raster is
// compressed in independent chunks instead of one enormous one. Each strip
// costs 8 bytes of tag data, so this trades a small header against the memory
// a single compression call has to hold.
var TARGET_STRIP_BYTES = 256 * 1024;

// grid: a mapshaper raster grid (width, height, bands, samples, bbox, nodata)
// opts.geoKeys: GeoTIFF geo keys to write, e.g. {ProjectedCSTypeGeoKey: 32615}
// opts.compress: false to store samples uncompressed
// opts.gdalMetadata: band metadata for GDAL's metadata tag, as
//   [{band: <0-based index>, name: 'UNITTYPE', role: 'unittype', value: 'ft'}]
// Returns a Uint8Array holding the whole file.
export function encodeGeoTIFF(grid, opts) {
  opts = opts || {};
  var compress = opts.compress !== false;
  var rowsPerStrip = getRowsPerStrip(grid);
  var strips = encodeStrips(grid, rowsPerStrip, compress);
  var entries = getTagEntries(grid, strips, rowsPerStrip, compress, opts.geoKeys);
  if (opts.gdalMetadata && opts.gdalMetadata.length > 0) {
    entries = entries.concat(ascii(TAGS.GDAL_METADATA, formatGdalMetadata(opts.gdalMetadata)))
      .sort(function(a, b) { return a.tag - b.tag; });
  }
  var layout = getFileLayout(entries, strips);
  var bytes = new Uint8Array(layout.fileSize);
  var view = new DataView(bytes.buffer);
  setStripOffsets(entries, strips, layout.stripDataOffset);
  writeHeader(view);
  writeIfd(view, bytes, entries, layout);
  writeStrips(bytes, strips, layout.stripDataOffset);
  return bytes;
}

function writeHeader(view) {
  view.setUint8(0, 0x49); // 'II' -- little-endian byte order
  view.setUint8(1, 0x49);
  view.setUint16(2, 42, true); // TIFF magic number
  view.setUint32(4, 8, true); // offset of the first IFD
}

function writeIfd(view, bytes, entries, layout) {
  var offset = layout.ifdOffset;
  var valueOffset = layout.valueDataOffset;
  view.setUint16(offset, entries.length, true);
  offset += 2;
  entries.forEach(function(entry) {
    var size = getEntryDataSize(entry);
    view.setUint16(offset, entry.tag, true);
    view.setUint16(offset + 2, entry.type, true);
    view.setUint32(offset + 4, entry.count, true);
    if (size <= 4) {
      // Small values live in the entry itself, left-aligned in the 4 bytes.
      writeEntryValues(view, bytes, entry, offset + 8);
    } else {
      view.setUint32(offset + 8, valueOffset, true);
      writeEntryValues(view, bytes, entry, valueOffset);
      valueOffset += size + (size % 2); // value blocks start on a word boundary
    }
    offset += 12;
  });
  view.setUint32(offset, 0, true); // no second IFD
}

function writeEntryValues(view, bytes, entry, offset) {
  var values = entry.values;
  if (entry.type == TIFF_TYPES.ASCII) {
    writeAsciiValue(bytes, values, offset);
    return;
  }
  for (var i = 0; i < values.length; i++) {
    if (entry.type == TIFF_TYPES.SHORT) {
      view.setUint16(offset + i * 2, values[i], true);
    } else if (entry.type == TIFF_TYPES.LONG) {
      view.setUint32(offset + i * 4, values[i], true);
    } else if (entry.type == TIFF_TYPES.DOUBLE) {
      view.setFloat64(offset + i * 8, values[i], true);
    } else {
      error('Unsupported TIFF field type:', entry.type);
    }
  }
}

// ASCII fields are NUL-terminated, and the terminator is counted.
function writeAsciiValue(bytes, str, offset) {
  for (var i = 0; i < str.length; i++) {
    bytes[offset + i] = str.charCodeAt(i) & 0x7f;
  }
  bytes[offset + str.length] = 0;
}

function getEntryDataSize(entry) {
  return TYPE_SIZES[entry.type] * entry.count;
}

function getFileLayout(entries, strips) {
  var ifdOffset = 8;
  var ifdSize = 2 + entries.length * 12 + 4;
  var valueDataOffset = ifdOffset + ifdSize;
  var valueDataSize = entries.reduce(function(memo, entry) {
    var size = getEntryDataSize(entry);
    return size <= 4 ? memo : memo + size + (size % 2);
  }, 0);
  var stripDataOffset = valueDataOffset + valueDataSize;
  var stripDataSize = strips.reduce(function(memo, strip) {
    return memo + strip.length;
  }, 0);
  return {
    ifdOffset: ifdOffset,
    valueDataOffset: valueDataOffset,
    stripDataOffset: stripDataOffset,
    fileSize: stripDataOffset + stripDataSize
  };
}

// StripOffsets can only be filled in once the size of the tag data is known.
function setStripOffsets(entries, strips, stripDataOffset) {
  var entry = findEntry(entries, TAGS.StripOffsets);
  var offset = stripDataOffset;
  strips.forEach(function(strip, i) {
    entry.values[i] = offset;
    offset += strip.length;
  });
}

function writeStrips(bytes, strips, stripDataOffset) {
  var offset = stripDataOffset;
  strips.forEach(function(strip) {
    bytes.set(strip, offset);
    offset += strip.length;
  });
}

function findEntry(entries, tag) {
  return entries.filter(function(entry) {
    return entry.tag == tag;
  })[0];
}

function encodeStrips(grid, rowsPerStrip, compress) {
  var sampleBytes = getSampleBytes(grid.samples);
  var bytesPerRow = getBytesPerRow(grid);
  var strips = [];
  var row = 0;
  var start, end, chunk;
  while (row < grid.height) {
    start = row * bytesPerRow;
    end = Math.min(start + rowsPerStrip * bytesPerRow, sampleBytes.length);
    chunk = sampleBytes.subarray(start, end);
    strips.push(compress ? deflateSync(chunk) : chunk);
    row += rowsPerStrip;
  }
  return strips;
}

function getRowsPerStrip(grid) {
  var rows = Math.floor(TARGET_STRIP_BYTES / Math.max(getBytesPerRow(grid), 1));
  return Math.max(1, Math.min(rows, grid.height));
}

function getBytesPerRow(grid) {
  return getBytesPerSample(grid.samples) * grid.bands * grid.width;
}

// TIFF stores samples in the file's byte order, which is little-endian here.
// Typed arrays use the platform's order, so a byte view can be handed straight
// to the encoder on a little-endian machine (all common ones) and needs
// swapping otherwise.
function getSampleBytes(samples) {
  var bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  var size = getBytesPerSample(samples);
  if (size == 1 || platformIsLittleEndian()) return bytes;
  return swapByteOrder(bytes, size);
}

function platformIsLittleEndian() {
  var probe = new Uint16Array([1]);
  return new Uint8Array(probe.buffer)[0] === 1;
}

function swapByteOrder(bytes, size) {
  var swapped = new Uint8Array(bytes.length);
  for (var i = 0; i < bytes.length; i += size) {
    for (var j = 0; j < size; j++) {
      swapped[i + j] = bytes[i + size - 1 - j];
    }
  }
  return swapped;
}

function getBytesPerSample(samples) {
  return samples.BYTES_PER_ELEMENT || 1;
}

function getSampleFormat(samples) {
  if (samples instanceof Float32Array || samples instanceof Float64Array) {
    return SAMPLE_FORMAT_FLOAT;
  }
  if (samples instanceof Int8Array || samples instanceof Int16Array ||
      samples instanceof Int32Array) {
    return SAMPLE_FORMAT_INT;
  }
  if (samples instanceof Uint8Array || samples instanceof Uint8ClampedArray ||
      samples instanceof Uint16Array || samples instanceof Uint32Array) {
    return SAMPLE_FORMAT_UINT;
  }
  error('Unsupported raster sample type');
}

function getTagEntries(grid, strips, rowsPerStrip, compress, geoKeys) {
  var bands = grid.bands;
  var bytesPerSample = getBytesPerSample(grid.samples);
  var entries = [
    long(TAGS.ImageWidth, [grid.width]),
    long(TAGS.ImageLength, [grid.height]),
    short(TAGS.BitsPerSample, repeat(bytesPerSample * 8, bands)),
    short(TAGS.Compression, [compress ? COMPRESSION_DEFLATE : COMPRESSION_NONE]),
    short(TAGS.PhotometricInterpretation, [getPhotometricInterpretation(bands)]),
    long(TAGS.StripOffsets, repeat(0, strips.length)), // filled in after layout
    short(TAGS.SamplesPerPixel, [bands]),
    long(TAGS.RowsPerStrip, [rowsPerStrip]),
    long(TAGS.StripByteCounts, strips.map(function(strip) {
      return strip.length;
    })),
    short(TAGS.PlanarConfiguration, [PLANAR_CONFIG_CHUNKY]),
    ascii(TAGS.Software, 'mapshaper'),
    short(TAGS.SampleFormat, repeat(getSampleFormat(grid.samples), bands))
  ];
  var extraSamples = getExtraSamples(bands);
  if (extraSamples) {
    entries.push(short(TAGS.ExtraSamples, extraSamples));
  }
  entries = entries.concat(getGeoreferencingEntries(grid, geoKeys));
  if (grid.nodata !== null && grid.nodata !== undefined) {
    // GDAL stores this value as text, and reads it back with a float parser
    // that accepts both integers and "nan".
    entries.push(ascii(TAGS.GDAL_NODATA, String(grid.nodata)));
  }
  return entries.sort(function(a, b) {
    return a.tag - b.tag;
  });
}

// Three or more bands are rendered as RGB(A) elsewhere in mapshaper, so they
// are tagged that way here; anything else is a measurement raster whose first
// band is the one to display.
function getPhotometricInterpretation(bands) {
  return bands >= 3 ? PHOTOMETRIC_RGB : PHOTOMETRIC_BLACK_IS_ZERO;
}

// Bands beyond the ones the photometric interpretation accounts for have to be
// declared as extra samples. A fourth band is treated as alpha, matching the
// renderer; other extras are left unspecified rather than guessing at them.
function getExtraSamples(bands) {
  var colorBands = bands >= 3 ? 3 : 1;
  var extras = repeat(EXTRA_SAMPLE_UNSPECIFIED, bands - colorBands);
  if (extras.length === 0) return null;
  if (bands == 4) extras[0] = EXTRA_SAMPLE_UNASSOCIATED_ALPHA;
  return extras;
}

function getGeoreferencingEntries(grid, geoKeys) {
  var bbox = grid.bbox;
  var dx = Math.abs(bbox[2] - bbox[0]) / grid.width;
  var dy = Math.abs(bbox[3] - bbox[1]) / grid.height;
  var entries = [
    // Pixel scale is unsigned; the tiepoint anchors the grid at its top-left
    // corner, which is where row 0 of the samples begins.
    double(TAGS.ModelPixelScale, [dx, dy, 0]),
    double(TAGS.ModelTiepoint, [0, 0, 0, bbox[0], bbox[3], 0])
  ];
  return entries.concat(getGeoKeyEntries(geoKeys));
}

// The geo keys live in a directory tag of their own: a four-short header
// (version, revision, minor revision, key count) followed by four shorts per
// key. A short-valued key keeps its value in the directory; a double-valued one
// points into the GeoDoubleParams tag, which holds them all end to end.
function getGeoKeyEntries(geoKeys) {
  var names = Object.keys(geoKeys || {}).filter(function(name) {
    return name in GEO_KEYS && isFinite(geoKeys[name]);
  }).sort(function(a, b) {
    return GEO_KEYS[a][0] - GEO_KEYS[b][0];
  });
  var values = [1, 1, 0, names.length];
  var doubles = [];
  if (names.length === 0) return [];
  names.forEach(function(name) {
    var id = GEO_KEYS[name][0];
    if (GEO_KEYS[name][1] == 'double') {
      values.push(id, TAGS.GeoDoubleParams, 1, doubles.length);
      doubles.push(geoKeys[name]);
    } else {
      values.push(id, 0, 1, geoKeys[name]);
    }
  });
  var entries = [short(TAGS.GeoKeyDirectory, values)];
  if (doubles.length > 0) {
    entries.push(double(TAGS.GeoDoubleParams, doubles));
  }
  return entries;
}

function formatGdalMetadata(items) {
  return '<GDALMetadata>\n' + items.map(function(o) {
    return '  <Item name="' + escapeXml(o.name) + '" sample="' + o.band + '"' +
      (o.role ? ' role="' + escapeXml(o.role) + '"' : '') + '>' +
      escapeXml(String(o.value)) + '</Item>\n';
  }).join('') + '</GDALMetadata>';
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function repeat(val, count) {
  var arr = [];
  for (var i = 0; i < count; i++) arr.push(val);
  return arr;
}

function short(tag, values) {
  return {tag: tag, type: TIFF_TYPES.SHORT, count: values.length, values: values};
}

function long(tag, values) {
  return {tag: tag, type: TIFF_TYPES.LONG, count: values.length, values: values};
}

function double(tag, values) {
  return {tag: tag, type: TIFF_TYPES.DOUBLE, count: values.length, values: values};
}

function ascii(tag, str) {
  return {tag: tag, type: TIFF_TYPES.ASCII, count: str.length + 1, values: str};
}
