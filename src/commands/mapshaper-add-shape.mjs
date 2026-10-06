import cmd from '../mapshaper-cmd';
import { stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { importGeoJSON } from '../geojson/geojson-import';
import { setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { mergeDatasetsIntoDataset } from '../dataset/mapshaper-merging';
import { DataTable } from '../datatable/mapshaper-data-table';
import { matchTargetFieldTypes } from '../datatable/mapshaper-match-field-types';
import { isSupportedSvgStyleProperty, parseStyleLiteral } from '../svg/svg-properties';
import { findLineEnds } from '../paths/mapshaper-path-endpoints';

cmd.addShape = addShape;

// Adds one feature -- a point, a line or a polygon -- to the target layer, or
// to a new layer. Style options (stroke=, fill=, line-end= ...) are written to
// the new feature, so that creating and styling a shape is one command, one
// undo step and one entry in the session history. The GUI's line and polygon
// drawing tools create every shape with this command.
//
// Options consumed directly by this command, rather than passed through as
// style properties.
var RESERVED_OPTIONS = {
  closed: true,
  coordinates: true,
  extend: true,
  geojson: true,
  name: true,
  no_replace: true,
  properties: true,
  target: true
};

export function addShape(targetLayers, targetDataset, opts) {
  var targetLyr, targetType, feature, dataset, outputLyr, merged;
  if (targetLayers.length > 1) {
    stop('Command expects a single target layer');
  }
  targetLyr = targetLayers[0]; // may be undefined
  if (opts.extend) {
    return [extendLine(targetLyr, targetDataset, opts)];
  }
  targetType = !opts.no_replace && targetLyr && targetLyr.geometry_type || null;
  feature = toFeature(opts, targetType);
  if (!opts.no_replace) {
    matchTargetFieldTypes(feature.properties, targetLyr);
  }
  dataset = importGeoJSON(feature);
  outputLyr = mergeDatasetsIntoDataset(targetDataset, [dataset])[0];
  if (opts.no_replace || !targetLyr) {
    // create new layer
    setOutputLayerName(outputLyr, targetLyr && targetLyr.name, null, opts);
    return [outputLyr];
  }
  // verbose: false silences "Fields [...] are missing from one or more layers":
  // a styled shape rarely has the same fields as the layer it joins.
  merged = cmd.mergeLayers([targetLyr, outputLyr], {force: true, verbose: false});
  // mergeLayers() drops empty layers before merging, so adding the first shape
  // to an empty layer hands back the one-shape layer on its own, without the
  // name of the layer it was added to.
  merged[0].name = targetLyr.name;
  return merged;
}

// Joins the new path to the line in the target layer that has an endpoint at
// the path's first vertex (or, failing that, its last), so that the two become
// one path of the same feature. The path's arcs are appended to the line's
// arcs, which leaves the rest of the layer, and the line's attributes, as they
// were; style options update the line's attributes.
//
// The vertex has to match the endpoint exactly, and only one line may end
// there: where several do, which one to extend is not clear.
function extendLine(targetLyr, targetDataset, opts) {
  var feature, coords, match, pathLyr, pathIds, outputLyr, shape, part, records;
  if (!targetLyr || targetLyr.geometry_type != 'polyline') {
    stop('The extend option requires a polyline target layer');
  }
  if (opts.no_replace || opts.closed) {
    stop('The extend option can not be combined with', opts.closed ? 'closed' : '+');
  }
  feature = toFeature(opts, 'polyline');
  if (!feature.geometry || feature.geometry.type != 'LineString') {
    stop('The extend option requires a single path');
  }
  coords = feature.geometry.coordinates;
  match = findLineEnd(targetLyr, targetDataset.arcs, coords[0]);
  if (!match) {
    match = findLineEnd(targetLyr, targetDataset.arcs, coords[coords.length - 1]);
    if (match) coords = coords.concat().reverse();
  }
  if (!match) {
    stop('No line in the target layer ends at', coords[0].join(','), 'or',
      coords[coords.length - 1].join(','));
  }
  feature.geometry = {type: 'LineString', coordinates: coords};
  pathLyr = mergeDatasetsIntoDataset(targetDataset, [importGeoJSON(feature)])[0];
  pathIds = pathLyr.shapes[0][0];
  // The extended line goes in a copy of the target layer, which replaces it,
  // as a merged layer does: until the command is done, the GUI goes on drawing
  // the layer it has, whose arc ids its display arcs cover, and undo restores
  // that layer along with the dataset's arcs.
  outputLyr = Object.assign({}, targetLyr, {shapes: targetLyr.shapes.concat()});
  shape = outputLyr.shapes[match.shapeId] = outputLyr.shapes[match.shapeId].map(function(part) {
    return part.concat();
  });
  part = shape[match.partId];
  if (match.atStart) {
    // the path runs out from the line's first vertex, so it goes on reversed
    part.unshift.apply(part, reversePathIds(pathIds));
  } else {
    part.push.apply(part, pathIds);
  }
  if (feature.properties && Object.keys(feature.properties).length > 0) {
    matchTargetFieldTypes(feature.properties, targetLyr);
    records = targetLyr.data ? targetLyr.data.getRecords().concat() :
      new DataTable(targetLyr.shapes.length).getRecords();
    records[match.shapeId] = utils.extend({}, records[match.shapeId], feature.properties);
    outputLyr.data = new DataTable(records);
  }
  return outputLyr;
}

// Returns {shapeId, partId, atStart} for the one open path in @lyr with an
// endpoint at @p, or null if there is none
function findLineEnd(lyr, arcs, p) {
  var matches = findLineEnds(lyr, arcs, p);
  if (matches.length > 1) {
    stop('More than one line ends at', p.join(',') + '; unable to extend');
  }
  return matches[0] || null;
}

function reversePathIds(ids) {
  return ids.map(function(id) { return ~id; }).reverse();
}

// opts: parsed command options
// geomType: geometry type of the layer the shape is joining, or null
export function toFeature(opts, geomType) {
  var feature;
  if (opts.geojson) {
    feature = toGeoJSONFeature(parseArg(opts.geojson));
  } else {
    feature = {
      type: 'Feature',
      properties: parseProperties(opts.properties),
      geometry: opts.coordinates && parseCoordsAsGeometry(opts.coordinates) || null
    };
    if (!feature.geometry) {
      stop('Missing required shape coordinates');
    }
  }
  if (feature.type != 'Feature') {
    // a FeatureCollection: neither closed= nor the target's type can be
    // applied to it as a whole, but its features can still take a style
    (feature.features || []).forEach(function(feat) {
      addStyleProperties(feat, opts);
    });
    return feature;
  }
  if (opts.geojson && opts.properties) {
    feature.properties = utils.extend(feature.properties || {}, parseProperties(opts.properties));
  }
  if (opts.closed) {
    closePath(feature);
  }
  conformToLayerType(feature, geomType);
  addStyleProperties(feature, opts);
  return feature;
}

function toGeoJSONFeature(obj) {
  if (!obj || !obj.type) {
    stop('Unable to parse geojson= value');
  }
  if (obj.type == 'Feature' || obj.type == 'FeatureCollection') {
    return obj;
  }
  return {type: 'Feature', properties: null, geometry: obj};
}

// Turns an open path into a polygon by joining its last vertex to its first.
function closePath(feature) {
  var geom = feature.geometry;
  var coords;
  if (!geom || geom.type == 'Polygon' || geom.type == 'MultiPolygon') return;
  if (geom.type != 'LineString' || geom.coordinates.length < 3) {
    stop('The closed option requires a path with at least three vertices');
  }
  coords = geom.coordinates.concat();
  if (!samePoint(coords[0], coords[coords.length - 1])) {
    coords.push(coords[0]);
  }
  feature.geometry = {type: 'Polygon', coordinates: [coords]};
}

function conformToLayerType(feature, geomType) {
  var geom = feature.geometry;
  var type = geom ? geom.type : null;
  if (!geomType || !geom) return;
  if (geomType == 'point' && type != 'Point' && type != 'MultiPoint') {
    stop('Expected point coordinates, received', type);
  }
  if (geomType == 'polygon' && type != 'Polygon' && type != 'MultiPolygon') {
    stop('Expected polygon coordinates, received', type +
      '. Use the closed option to close an open path.');
  }
  if (geomType == 'polyline') {
    if (type == 'Polygon' && geom.coordinates.length == 1) {
      // a ring added to a polyline layer is a closed line
      feature.geometry = {type: 'LineString', coordinates: geom.coordinates[0]};
    } else if (type != 'LineString' && type != 'MultiLineString') {
      stop('Expected polyline coordinates, received', type);
    }
  }
}

// Any option matching a -style property becomes a property of the new feature,
// stored as the type -style would store it in. Only literal values are
// accepted: there is no layer of features for an expression to be evaluated
// against. An empty value is skipped, since there is nothing to remove from a
// feature that does not exist yet.
function addStyleProperties(feature, opts) {
  Object.keys(opts).forEach(function(key) {
    var name = key.replace(/_/g, '-');
    var raw = opts[key];
    var val;
    if (key in RESERVED_OPTIONS || !isSupportedSvgStyleProperty(name)) return;
    if (raw === '' || raw === null || raw === undefined) return;
    val = parseStyleLiteral(name, raw);
    if (val === undefined) {
      stop('Unexpected value for', name + ':', raw);
    }
    if (!feature.properties) feature.properties = {};
    feature.properties[name] = val;
  });
}

function parseArg(obj) {
  return typeof obj == 'string' ? JSON.parse(obj) : obj;
}

function parseProperties(arg) {
  if (!arg) return null;
  return parseArg(arg);
}

function isArrayOfNumbers(arr) {
  return arr.length >= 2 && arr.every(utils.isNumber);
}

function isClosedPath(arr) {
  return isArrayOfPoints(arr) && arr.length > 3 && samePoint(arr[0], arr[arr.length - 1]);
}

function samePoint(a, b) {
  return a[0] == b[0] && a[1] == b[1];
}

function isArrayOfPoints(arr) {
  return arr.every(isPoint);
}

function isPoint(arr) {
  return arr && arr.length == 2 && isArrayOfNumbers(arr);
}

function transposeCoords(arr) {
  var coords = [];
  for (var i=0; i<arr.length; i+=2) {
    coords.push([arr[i], arr[i+1]]);
  }
  if (!isArrayOfPoints(coords)) {
    stop('Unable to parse x,y,x,y... coordinates');
  }
  return coords;
}

function parseCoordsAsGeometry(arg) {
  if (typeof arg == 'string') {
    arg = arg.trim();
    if (!arg.startsWith('[') && !arg.endsWith(']')) {
      arg = '[' + arg + ']';
    }
  }
  var arr = parseArg(arg);
  if (isPoint(arr)) {
    return {
      type: 'Point',
      coordinates: arr
    };
  }

  if (isArrayOfNumbers(arr)) {
    arr = transposeCoords(arr);
  }

  if (isClosedPath(arr)) {
    return {
      type: 'Polygon',
      coordinates: [arr]
    };
  }

  if (isArrayOfPoints(arr)) {
    return {
      type: 'LineString',
      coordinates: arr
    };
  }

  stop('Unable to import coordinates');
}
