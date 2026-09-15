import cmd from '../mapshaper-cmd';
import { stop, warn } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { importGeoJSON } from '../geojson/geojson-import';
import { setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { mergeDatasetsIntoDataset } from '../dataset/mapshaper-merging';
import { getColumnType } from '../datatable/mapshaper-data-utils';
import {
  parseLabelCoords, parseJsonArg, warnIfCurveIsUnprojected,
  warnAboutOutOfRangeCorners
} from './mapshaper-label-geom';
import {
  isSupportedSvgStyleProperty, parseKnotIndexList, parseStyleLiteral,
  setLabelPositionStyle
} from '../svg/svg-properties';
import { getLabelTextHash } from '../svg/svg-label-fit';

cmd.addLabel = addLabel;

// Adds a map label to a point layer. One coordinate pair makes an anchored
// label; several make a path-aligned label whose points are the knots its
// curve is fitted through. See docs/development/label-tool-design.md.
//
// Options consumed directly by this command, rather than passed through as
// label properties.
var RESERVED_OPTIONS = {
  coordinates: true,
  corners: true,
  name: true,
  no_replace: true,
  properties: true,
  target: true,
  text: true,
  text_width: true
};

export function addLabel(targetLayers, targetDataset, opts) {
  var targetLyr, coords, feature, dataset, outputLyr;
  if (targetLayers.length > 1) {
    stop('Command expects a single target layer');
  }
  targetLyr = targetLayers[0]; // may be undefined
  if (targetLyr && !opts.no_replace) {
    requirePointTarget(targetLyr);
  }
  coords = parseLabelCoords(opts.coordinates);
  feature = toLabelFeature(opts, coords);
  matchTargetFieldTypes(feature.properties, targetLyr);
  warnIfCurveIsUnprojected(targetDataset, coords.length);
  dataset = importGeoJSON(feature);
  outputLyr = mergeDatasetsIntoDataset(targetDataset, [dataset])[0];
  if (opts.no_replace || !targetLyr) {
    setOutputLayerName(outputLyr, targetLyr && targetLyr.name, 'labels', opts);
    return [outputLyr];
  }
  // verbose: false silences "Fields [...] are missing from one or more layers".
  // Labels differ in which style properties they carry -- one has an icon, the
  // next a css rule -- so a one-label layer almost never has the same fields as
  // the layer it is joining.
  //
  // force stays on for the same reason.
  return cmd.mergeLayers([targetLyr, outputLyr], {force: true, verbose: false});
}

// Makes the new label's values match the types the target layer already holds,
// so that adding a label cannot be the thing that breaks a layer's schema.
//
// Only string and number are worth reconciling. Anything else in a style field
// is odd enough that quietly rewriting it would hide a real problem.
function matchTargetFieldTypes(d, targetLyr) {
  var records = targetLyr && targetLyr.data ? targetLyr.data.getRecords() : null;
  if (!records || records.length === 0) return;
  Object.keys(d).forEach(function(key) {
    var type = getColumnType(key, records);
    var val = d[key];
    if (!type || type === typeof val) return;
    if (type == 'string' && utils.isNumber(val)) {
      d[key] = String(val);
    } else if (type == 'number' && utils.isString(val)) {
      if (isFiniteString(val)) {
        d[key] = Number(val);
      } else {
        stringifyColumn(key, records);
      }
    }
  });
}

// Widens a column of numbers to strings, for a value that cannot be a number:
// '0.45em' is a length with units, which is what a label position east of its
// anchor expands to.
//
// Every number has a faithful string form, and these values are written out as
// SVG attributes, so restating 0 as '0' changes nothing that is drawn or
// exported. Narrowing the other way is what is not always possible, which is
// why this is the direction the column moves.
//
// Reached by a layer whose dx column holds numbers -- written before label
// positions stored dx as a string -- which would otherwise refuse every label
// offered an em offset.
function stringifyColumn(key, records) {
  for (var i = 0; i < records.length; i++) {
    if (records[i] && utils.isNumber(records[i][key])) {
      records[i][key] = String(records[i][key]);
    }
  }
}

function isFiniteString(str) {
  return str.trim() !== '' && utils.isFiniteNumber(Number(str));
}

// Both kinds of label are point features, so a non-point target can never
// receive one. Refusing is better than silently making a new layer, because
// the CLI user named a target explicitly.
function requirePointTarget(lyr) {
  if (lyr.geometry_type && lyr.geometry_type != 'point') {
    stop('Labels can only be added to a point layer; target "' +
      (lyr.name || '[unnamed]') + '" contains ' + lyr.geometry_type + 's. ' +
      'Use no-replace to add labels as a new layer.');
  }
}

function toLabelFeature(opts, coords) {
  return {
    type: 'Feature',
    properties: getLabelProperties(opts, coords.length),
    geometry: coords.length == 1 ?
      {type: 'Point', coordinates: coords[0]} :
      {type: 'MultiPoint', coordinates: coords}
  };
}

function getLabelProperties(opts, knotCount) {
  var d = {};
  var corners;
  if (opts.properties) {
    utils.extend(d, parseJsonArg(opts.properties, 'properties'));
  }
  // an explicit empty string is meaningful: it creates a label that the user
  // is about to type into, which is how the GUI starts an editing session
  d['label-text'] = 'text' in opts ? String(opts.text) : '';

  // any option matching a -style property becomes a label property, so that
  // creating and styling a label is one command and one history entry
  Object.keys(opts).forEach(function(key) {
    var name = key.replace(/_/g, '-');
    var val;
    if (key in RESERVED_OPTIONS) return;
    if (!isSupportedSvgStyleProperty(name)) return;
    // Stored as the type -style would store it in. Copying the option string
    // through instead left icon-size=20 as "20" here and 20 from -style, so a
    // layer holding both kinds of label had a column with two types in it --
    // which the merge below then refused, making the next label impossible to
    // add.
    val = parseStyleLiteral(name, opts[key]);
    if (val === undefined) {
      stop('Unexpected value for', name + ':', opts[key]);
    }
    d[name] = val;
    // label-pos is shorthand, not a property anything renders: it stands for a
    // text-anchor and a dx/dy. Left unexpanded, the label carries a position it
    // is not drawn in. Expanded here rather than after the loop, so that a dx=
    // or dy= given after it still wins -- which is where -style expands it too.
    if (name == 'label-pos' && !setLabelPositionStyle(d, d[name])) {
      stop('Unexpected value for label-pos:', d[name]);
    }
  });

  if (opts.corners) {
    corners = parseKnotIndexList(opts.corners);
    if (!corners) {
      stop('Invalid corners parameter:', opts.corners,
        '(expected a comma-separated list of knot indexes)');
    }
    if (knotCount < 3) {
      // the ends of a curve already have one-sided tangents, so marking them
      // as corners changes nothing
      warn('Ignoring corners= on a label with', knotCount,
        knotCount == 1 ? 'point' : 'points');
    } else {
      warnAboutOutOfRangeCorners(corners, knotCount);
      d['label-corners'] = corners.join(',');
    }
  }

  if (opts.text_width !== undefined) {
    if (opts.text_width >= 0 === false) {
      stop('Invalid text-width parameter:', opts.text_width);
    }
    d['label-text-width'] = opts.text_width;
    // Fingerprint the values the width describes, so that a later
    // -style label-text= or -style font-size= invalidates it and export falls
    // back to drawing the label rather than dropping it on a stale number.
    d['label-text-hash'] = getLabelTextHash(d);
  }
  return d;
}

