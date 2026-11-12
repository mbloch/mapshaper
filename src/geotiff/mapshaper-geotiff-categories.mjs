import { getAuxBandXml, unescapeXml } from './mapshaper-geotiff-aux';

// The categories of a GeoTIFF's bands, as GDAL stores them: a raster attribute
// table (RAT) in the file's GDAL_METADATA tag (where GDAL 3.x puts it), or a
// RAT or a list of category names in the band's entry of an .aux.xml sidecar,
// which takes precedence, as it does in GDAL. A RAT can give colors too.
// Only thematic tables count: an athematic RAT describes ranges of values
// (e.g. a histogram), not categories.

// RAT field usages and types (GDALRATFieldUsage, GDALRATFieldType)
var USAGE_GENERIC = 0, USAGE_NAME = 2, USAGE_MIN = 3, USAGE_MAX = 4, USAGE_MINMAX = 5,
  USAGE_RED = 6, USAGE_GREEN = 7, USAGE_BLUE = 8;
var TYPE_STRING = 2;

// Returns {names, colors} for a band, either of them null if the file doesn't
// give it: names: {<value>: name}; colors: {<value>: '#rrggbb'}
// @metadata: the GDAL_METADATA tag's contents, or null
// @aux: the sidecar's contents, or null
// @band: 0-based band index in the file
export function readBandCategories(metadata, aux, band) {
  var auxXml = aux ? getAuxBandXml(aux, band) : null;
  var found = auxXml ? parseBandCategoryXml(auxXml) : null;
  if (!found && metadata) {
    found = parseBandCategoryXml(getMetadataRatXml(metadata, band) || '');
  }
  return found || {names: null, colors: null};
}

// The RAT that GDAL writes into the GDAL_METADATA tag for a band:
// <Item name="DEFAULT_RASTER_ATTRIBUTE_TABLE" sample="0" role="rat">
function getMetadataRatXml(metadata, band) {
  var rx = /<Item\b([^>]*)>([\s\S]*?)<\/Item>/gi;
  var match, attrs, sample, xml;
  while ((match = rx.exec(metadata))) {
    attrs = match[1];
    sample = /\bsample\s*=\s*"(\d+)"/i.exec(attrs);
    if (!/\brole\s*=\s*"rat"/i.test(attrs) || !sample || +sample[1] != band) continue;
    xml = match[2];
    return /^\s*&lt;/.test(xml) ? unescapeXml(xml) : xml;
  }
  return null;
}

// {names, colors} from a band's RAT or CategoryNames, or null if it has
// neither
export function parseBandCategoryXml(xml) {
  var rat = /<GDALRasterAttributeTable\b([^>]*)>([\s\S]*?)<\/GDALRasterAttributeTable>/i.exec(xml);
  var names = rat ? null : parseCategoryNames(xml);
  if (rat) return parseRat(rat[1], rat[2]);
  return names ? {names: names, colors: null} : null;
}

// <CategoryNames><Category>name</Category>...</CategoryNames>, in which a
// category's position is its value
function parseCategoryNames(xml) {
  var list = /<CategoryNames\b[^>]*>([\s\S]*?)<\/CategoryNames>/i.exec(xml);
  var rx = /<Category\b[^>]*?(?:\/>|>([\s\S]*?)<\/Category>)/gi;
  var names = {}, found = false, i = 0, match, name;
  if (!list) return null;
  while ((match = rx.exec(list[1]))) {
    name = unescapeXml(match[1] || '').trim();
    if (name) {
      names[i] = name;
      found = true;
    }
    i++;
  }
  return found ? names : null;
}

function parseRat(attrs, body) {
  var type = /\btableType\s*=\s*"([^"]*)"/i.exec(attrs);
  var row0 = readNumberAttr(attrs, 'Row0Min');
  var binSize = readNumberAttr(attrs, 'BinSize');
  var fields = parseRatFields(body);
  var rows = parseRatRows(body);
  var nameCol = findNameColumn(fields);
  var valueCol = findValueColumn(fields);
  var rgb = [USAGE_RED, USAGE_GREEN, USAGE_BLUE].map(function(usage) {
    return fields.findIndex(function(f) { return f.usage == usage; });
  });
  var hasRgb = rgb.every(function(col) { return col > -1; });
  var names = {}, colors = {}, foundNames = false, foundColors = false;
  if (type && /athematic/i.test(type[1]) || rows.length === 0) return null;
  rows.forEach(function(row, i) {
    var value = getRowValue(row, i, valueCol, fields, row0, binSize);
    var name, color;
    if (value === null) return;
    name = nameCol > -1 ? (row[nameCol] || '').trim() : '';
    if (name) {
      names[value] = name;
      foundNames = true;
    }
    color = hasRgb ? formatRgb(rgb.map(function(col) { return +row[col]; })) : null;
    if (color) {
      colors[value] = color;
      foundColors = true;
    }
  });
  if (!foundNames && !foundColors) return null;
  return {names: foundNames ? names : null, colors: foundColors ? colors : null};
}

// [{name, type, usage}]
function parseRatFields(body) {
  var rx = /<FieldDefn\b[^>]*>([\s\S]*?)<\/FieldDefn>/gi;
  var fields = [], match;
  while ((match = rx.exec(body))) {
    fields.push({
      name: readElement(match[1], 'Name') || '',
      type: +readElement(match[1], 'Type'),
      usage: +readElement(match[1], 'Usage')
    });
  }
  return fields;
}

// [[value, ...]], as strings
function parseRatRows(body) {
  var rx = /<Row\b[^>]*>([\s\S]*?)<\/Row>/gi;
  var cellRx = /<F\b[^>]*?(?:\/>|>([\s\S]*?)<\/F>)/gi;
  var rows = [], match, cell, row;
  while ((match = rx.exec(body))) {
    row = [];
    cellRx.lastIndex = 0;
    while ((cell = cellRx.exec(match[1]))) {
      row.push(unescapeXml(cell[1] || ''));
    }
    rows.push(row);
  }
  return rows;
}

// The column of names: the one GDAL calls the name, or else a text column
// (e.g. the Class_Name of an ArcGIS value attribute table)
function findNameColumn(fields) {
  var i = fields.findIndex(function(f) { return f.usage == USAGE_NAME; });
  if (i > -1) return i;
  return fields.findIndex(function(f) { return f.type == TYPE_STRING && f.usage == USAGE_GENERIC; });
}

// The column of pixel values: GDAL's MinMax, or a generic column named Value
// (as in ArcGIS tables); -1 if rows are values by their position
function findValueColumn(fields) {
  var i = fields.findIndex(function(f) { return f.usage == USAGE_MINMAX; });
  if (i > -1) return i;
  return fields.findIndex(function(f) {
    return f.usage == USAGE_GENERIC && f.type != TYPE_STRING && /^value$/i.test(f.name);
  });
}

// A row's value, or null if the row is a range of values rather than one
function getRowValue(row, i, valueCol, fields, row0, binSize) {
  var minCol, maxCol, val;
  if (valueCol > -1) {
    val = +row[valueCol];
    return row[valueCol] !== '' && isFinite(val) ? val : null;
  }
  minCol = fields.findIndex(function(f) { return f.usage == USAGE_MIN; });
  maxCol = fields.findIndex(function(f) { return f.usage == USAGE_MAX; });
  if (minCol > -1 && maxCol > -1) {
    return row[minCol] === row[maxCol] && isFinite(+row[minCol]) ? +row[minCol] : null;
  }
  if (row0 !== null && binSize !== null) {
    return binSize == 1 ? row0 + i : null;
  }
  return i;
}

function formatRgb(rgb) {
  if (!rgb.every(function(c) { return c >= 0 && c <= 255; })) return null;
  return '#' + rgb.map(function(c) {
    return (Math.round(c) + 0x100).toString(16).slice(1);
  }).join('');
}

function readElement(xml, name) {
  var match = new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)</' + name + '>', 'i').exec(xml);
  return match ? unescapeXml(match[1]).trim() : null;
}

function readNumberAttr(attrs, name) {
  var match = new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"', 'i').exec(attrs);
  return match && match[1] !== '' && isFinite(+match[1]) ? +match[1] : null;
}
