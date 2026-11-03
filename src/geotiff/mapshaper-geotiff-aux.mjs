import { decodeString } from '../text/mapshaper-encodings';

// GDAL's "persistent auxiliary metadata" sidecar, named after the whole raster
// filename rather than replacing its extension (world.tif -> world.tif.aux.xml).
// Unlike the .prj file that accompanies a shapefile, this is a sidecar that
// GDAL-based software (QGIS included) actually consults for a GeoTIFF's CRS, so
// it is where mapshaper puts a projection that GeoTIFF itself cannot describe.
export var AUX_EXT = '.aux.xml';

export function getAuxFilename(filename) {
  return filename + AUX_EXT;
}

export function isAuxFilename(filename) {
  return /\.aux\.xml$/i.test(filename || '');
}

// Returns the raster a sidecar belongs to: world.tif.aux.xml -> world.tif
export function getAuxSourceFilename(filename) {
  return String(filename).replace(/\.aux\.xml$/i, '');
}

export function formatAuxXml(wkt) {
  return '<PAMDataset>\n  <SRS>' + escapeXml(wkt) + '</SRS>\n</PAMDataset>\n';
}

// The CRS a sidecar carries, or null. Of the rest of what GDAL writes to these
// files, only the band values read by parseAuxBandInfo() are used; statistics
// and overviews describe data that mapshaper reads from the raster itself.
export function parseAuxCrsString(content) {
  var xml = getAuxXml(content);
  var match = /<SRS\b[^>]*>([\s\S]*?)<\/SRS>/i.exec(xml);
  var srs = match ? unescapeXml(match[1]).trim() : '';
  return srs || null;
}

// How to read the values of a band: {units, scale, offset}, with null for
// anything the sidecar does not say.
// @band: 0-based band index (GDAL numbers bands from 1)
export function parseAuxBandInfo(content, band) {
  var xml = getAuxXml(content);
  var rx = /<PAMRasterBand\b([^>]*)>([\s\S]*?)<\/PAMRasterBand>/gi;
  var match, num;
  while ((match = rx.exec(xml))) {
    num = /\bband\s*=\s*"(\d+)"/i.exec(match[1]);
    if (num && +num[1] == band + 1) {
      return {
        units: readXmlElement(match[2], 'UnitType'),
        scale: readXmlNumber(match[2], 'Scale'),
        offset: readXmlNumber(match[2], 'Offset')
      };
    }
  }
  return {units: null, scale: null, offset: null};
}

function getAuxXml(content) {
  return typeof content == 'string' ? content :
    content ? decodeString(content, 'utf8') : '';
}

function readXmlElement(xml, name) {
  var match = new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)</' + name + '>', 'i').exec(xml);
  var str = match ? unescapeXml(match[1]).trim() : '';
  return str || null;
}

function readXmlNumber(xml, name) {
  var str = readXmlElement(xml, name);
  return str !== null && isFinite(+str) ? +str : null;
}

// GDAL states the SRS in WKT, but a hand-written sidecar may hold an EPSG code
// or a proj4 definition instead, which mapshaper can use as they are.
export function auxCrsIsWkt(str) {
  return /^\s*[A-Z_]+\[/i.test(str || '');
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function unescapeXml(str) {
  return str.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
