// Short descriptions of what a layer holds, for the contents column of the
// layer panel: "6 polygons", "1 data record", "12 labels".
//
// A point layer is described by how its features are drawn, in the terms of
// the point style panel: labels, symbols, circles and plain points. A layer
// that mixes them lists each kind it has, e.g. "12 labels, 30 points".
//
// Features with null geometry are left out of the counts, which say what is on
// the map. The column is too narrow to list them as well, so they go in a
// tooltip with the full description.

var POINT_KINDS = ['label', 'symbol', 'circle', 'point'];

// How a point feature is drawn, given its data record.
// A label wins over any symbol or circle drawn with it.
export function getPointKind(d) {
  if (!d) return 'point';
  if ('label-text' in d) return 'label';
  if (d['svg-symbol'] || d.icon) return 'symbol';
  if (d.r > 0) return 'circle';
  return 'point';
}

// The kind of feature a point layer is set up for, from its field names:
// names the features of an empty layer, e.g. "0 labels".
export function getPointLayerKind(fields) {
  if (fields.includes('label-text')) return 'label';
  if (fields.includes('svg-symbol') || fields.includes('icon')) return 'symbol';
  if (fields.includes('r')) return 'circle';
  return 'point';
}

// Same test as the -info command's null shape count
export function isNullShape(shp) {
  return !shp || shp.length === 0;
}

// @geometryType: 'point', 'polygon' or 'polyline'
// @shapes: the layer's shapes
// @records: data records, or null for a layer without attribute data
// @fields: names of the layer's data fields
// Returns {text, nulls, title}; title is the tooltip, or null if there are no nulls.
export function describeFeatureContents(geometryType, shapes, records, fields) {
  var nulls = shapes.length - countNonNull(shapes);
  var text = geometryType == 'point' ?
    describePoints(shapes, records, fields || []) :
    formatCount(shapes.length - nulls, geometryType);
  return {
    text: text,
    nulls: nulls,
    title: nulls > 0 ? text + ', ' + formatInteger(nulls) + ' without geometry' : null
  };
}

function describePoints(shapes, records, fields) {
  var counts = {label: 0, symbol: 0, circle: 0, point: 0};
  var parts, i;
  for (i=0; i<shapes.length; i++) {
    if (isNullShape(shapes[i])) continue;
    counts[getPointKind(records ? records[i] : null)]++;
  }
  parts = POINT_KINDS.filter(function(kind) {
    return counts[kind] > 0;
  }).map(function(kind) {
    return formatCount(counts[kind], kind);
  });
  return parts.length > 0 ? parts.join(', ') :
    formatCount(0, getPointLayerKind(fields));
}

function countNonNull(shapes) {
  var n = 0;
  for (var i=0; i<shapes.length; i++) {
    if (!isNullShape(shapes[i])) n++;
  }
  return n;
}

export function formatCount(n, noun) {
  return formatInteger(n) + ' ' + noun + (n == 1 ? '' : 's');
}

function formatInteger(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
