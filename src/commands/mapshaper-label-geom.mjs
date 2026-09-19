import { stop, warn } from '../utils/mapshaper-logging';
import { getDatasetCRS } from '../crs/mapshaper-projections';
import utils from '../utils/mapshaper-utils';

// Geometry concerns shared by the commands that write a label's knots,
// -add-label and -update-label. A label's knots are its geometry, so both
// commands accept coordinates in the same forms and answer the same questions
// about them. See docs/development/label-tool-design.md.

// Accepts "x,y,x,y,..." or a JSON array, either flat or as an array of pairs.
export function parseLabelCoords(arg) {
  var arr, coords;
  if (arg === undefined || arg === null || arg === '') {
    stop('Missing required coordinates parameter');
  }
  arr = utils.isString(arg) ? parseCoordString(arg) : arg;
  if (!Array.isArray(arr) || arr.length === 0) {
    stop('Unable to parse coordinates:', arg);
  }
  coords = Array.isArray(arr[0]) ? arr : transposeCoords(arr, arg);
  coords.forEach(function(p) {
    if (!Array.isArray(p) || p.length != 2 ||
        !utils.isFiniteNumber(p[0]) || !utils.isFiniteNumber(p[1])) {
      stop('Invalid coordinate pair:', JSON.stringify(p));
    }
  });
  return coords;
}

export function parseJsonArg(arg, name) {
  if (!utils.isString(arg)) return arg;
  try {
    return JSON.parse(arg);
  } catch(e) {
    stop('Unable to parse', name + ':', arg);
  }
}

// A curve is fitted in the coordinate space it is stored in, so a fit done in
// degrees bows incorrectly away from the equator. A modest curve in a small
// area is unaffected, so this warns rather than failing.
export function warnIfCurveIsUnprojected(dataset, knotCount) {
  var crs;
  if (knotCount < 2) return; // no curve to distort
  if (!dataset) return;
  crs = getDatasetCRS(dataset);
  if (crs && crs.is_latlong) {
    warn('Fitting a label curve to unprojected coordinates. Consider using -proj first.');
  }
}

function parseCoordString(str) {
  var s = String(str).trim();
  if (s.startsWith('[')) return parseJsonArg(s, 'coordinates');
  return s.split(/[,\s]+/).map(function(part) {
    var n = Number(part);
    if (part === '' || isNaN(n)) {
      stop('Unable to parse coordinates:', str);
    }
    return n;
  });
}

function transposeCoords(arr, srcArg) {
  var coords = [], i;
  if (arr.length % 2 !== 0) {
    stop('Expected an even number of coordinates; received', arr.length,
      'in:', srcArg);
  }
  for (i = 0; i < arr.length; i += 2) {
    coords.push([arr[i], arr[i + 1]]);
  }
  return coords;
}
