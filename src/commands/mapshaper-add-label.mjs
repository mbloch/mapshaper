import cmd from '../mapshaper-cmd';
import { stop, warn } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { importGeoJSON } from '../geojson/geojson-import';
import { setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { mergeDatasetsIntoDataset } from '../dataset/mapshaper-merging';
import { matchTargetFieldTypes } from '../datatable/mapshaper-match-field-types';
import {
  parseLabelCoords, parseJsonArg, warnIfCurveIsUnprojected
} from './mapshaper-label-geom';
import {
  isSupportedSvgStyleProperty, parseLabelPosition, parseStyleLiteral
} from '../svg/svg-properties';

cmd.addLabel = addLabel;

// Adds a map label to a point layer. One coordinate pair makes an anchored
// label; several make a path-aligned label whose points are the knots its
// curve is fitted through. See docs/development/label-tool-design.md.
//
// Options consumed directly by this command, rather than passed through as
// label properties.
var RESERVED_OPTIONS = {
  coordinates: true,
  name: true,
  no_replace: true,
  properties: true,
  target: true,
  text: true
};

export function addLabel(targetLayers, targetDataset, opts) {
  var targetLyr, coords, feature, dataset, outputLyr, merged;
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
  merged = cmd.mergeLayers([targetLyr, outputLyr], {force: true, verbose: false});
  // The target's name is restored because mergeLayers() drops empty layers
  // before merging: adding the first label to an empty layer hands back the
  // one-label layer on its own, which has no name because the name was on the
  // layer that was dropped. A layer called 'labels' would lose that name on
  // its first label, and the label tool creates exactly such a layer when it
  // opens with nothing loaded.
  merged[0].name = targetLyr.name;
  return merged;
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
    // label-pos is the only one of the four position properties stored: the
    // offsets and justification it stands for are resolved when the label is
    // drawn. A dx= or dy= given as well is kept and wins there, so the two can
    // be combined to nudge a label off a standard position.
    if (name == 'label-pos' && !parseLabelPosition(val)) {
      stop('Unexpected value for label-pos:', opts[key]);
    }
  });

  if (d['label-pos'] && knotCount > 1) {
    // A path label's text runs along its curve from a start offset, so it has
    // no position around an anchor to take. Warned about rather than rejected,
    // so that a script can style a mixed layer in one pass.
    warn('Ignoring label-pos on a label with', knotCount, 'points.',
      'Use label-start-offset= and text-anchor= to place text along a path.');
    delete d['label-pos'];
  }
  return d;
}

