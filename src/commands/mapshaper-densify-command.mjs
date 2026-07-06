import cmd from '../mapshaper-cmd';
import { DatasetEditor } from '../dataset/mapshaper-dataset-editor';
import { getDatasetCRS, isLatLngCRS } from '../crs/mapshaper-projections';
import { convertDistanceParam, convertIntervalParam, parseMeasure2 } from '../geom/mapshaper-units';
import { getInterpolationFunction, interpolatePoint2D } from '../geom/mapshaper-geodesic';
import { R, D2R, greatCircleDistance } from '../geom/mapshaper-basic-geom';
import { stop, message } from '../utils/mapshaper-logging';

cmd.densify = densifyCommandDataset;

// Add vertices along path segments so no segment is longer than an interval,
// interpolating along one of three paths:
//   geodesic (default for lat-long) - ellipsoidal shortest path
//   rhumb                           - constant bearing (loxodrome)
//   planar (default for projected)  - straight line in coordinate space
//
// interval= is a ground distance (with units, e.g. 100km) for geodesic/rhumb; for
// planar it is decimal degrees for lat-long data and coordinate units for
// projected data.
export function densifyCommandDataset(dataset, opts, targetLayers) {
  var crs = getDatasetCRS(dataset);
  var spherical = isLatLngCRS(crs);
  var mode = getDensifyMode(opts, spherical);
  var interval = getDensifyInterval(opts, crs, mode, spherical);
  var interpolate = getDensifyInterpolator(mode, crs);
  var segmentLength = getSegmentLengthFunction(mode);
  var targetSet = getTargetLayerSet(dataset, targetLayers);
  // full-longitude edge detection only applies to lat-long data (projected
  // coordinates routinely differ by more than 180 units)
  var stats = spherical ? {undividedWideSegments: 0} : null;
  var editor = new DatasetEditor(dataset);
  dataset.layers.forEach(function(lyr) {
    var densify = targetSet.indexOf(lyr) > -1 &&
      (lyr.geometry_type == 'polygon' || lyr.geometry_type == 'polyline');
    editor.editLayer(lyr, function(coords) {
      if (lyr.geometry_type == 'point') return coords; // pass points through
      return [densify ?
        densifyPath(coords, interval, interpolate, segmentLength, stats) : coords];
    });
  });
  editor.done();
  if (stats && stats.undividedWideSegments > 0) {
    message('Left ' + stats.undividedWideSegments + ' full-longitude edge(s) undivided; ' +
      (mode == 'geodesic' ?
        'geodesic interpolation can\'t subdivide an edge whose endpoints coincide on the globe -- use the rhumb or planar option.' :
        'the endpoints coincide, so there is no path to interpolate along.'));
  }
}

function getTargetLayerSet(dataset, targetLayers) {
  return targetLayers && targetLayers.length ? targetLayers : dataset.layers;
}

function getDensifyMode(opts, spherical) {
  var modes = ['geodesic', 'rhumb', 'planar'].filter(function(m) { return opts[m]; });
  if (modes.length > 1) {
    stop('Use only one of geodesic, rhumb or planar');
  }
  var mode = modes[0] || (spherical ? 'geodesic' : 'planar');
  if (!spherical && mode != 'planar') {
    stop('The ' + mode + ' option requires a lat-long dataset; use planar for projected data');
  }
  return mode;
}

function getDensifyInterval(opts, crs, mode, spherical) {
  if (opts.interval === undefined) {
    stop('Expected an interval= parameter');
  }
  var interval;
  if (mode == 'planar' && spherical) {
    // planar densification of lat-long data works in coordinate space, so the
    // interval is in decimal degrees
    interval = parseDegreeInterval(opts.interval);
  } else if (mode == 'planar') {
    // planar densification of projected data uses coordinate units
    interval = convertIntervalParam(opts.interval, crs);
  } else {
    // geodesic/rhumb measure the interval as a ground distance in meters
    interval = convertDistanceParam(opts.interval, crs);
  }
  if (interval > 0 === false) {
    stop('Expected a positive interval, received:', opts.interval);
  }
  return interval;
}

// Parse a decimal-degrees interval: a bare number, or a number with an explicit
// degree unit (e.g. 5deg or 5°). Distance units (km, mi, ...) are rejected
// because planar interpolation of lat-long data measures the interval in
// coordinate (degree) space.
function parseDegreeInterval(opt) {
  var str = String(opt).trim();
  var match = /^(-?\d*\.?\d+)\s*(?:d|deg|degs|degree|degrees|°)?$/i.exec(str);
  if (match) {
    return Number(match[1]);
  }
  if (parseMeasure2(str).units) {
    stop('Planar densification of a lat-long dataset uses decimal degrees; "' + opt +
      '" has distance units -- use the geodesic or rhumb option for a ground distance.');
  }
  stop('Invalid interval:', opt);
}

function getDensifyInterpolator(mode, crs) {
  if (mode == 'planar') {
    return function(a, b, k) { return interpolatePoint2D(a[0], a[1], b[0], b[1], k); };
  }
  if (mode == 'rhumb') {
    return interpolateRhumbPoint;
  }
  var geodesic = getInterpolationFunction(crs);
  return function(a, b, k) { return geodesic(a[0], a[1], b[0], b[1], k); };
}

function getSegmentLengthFunction(mode) {
  if (mode == 'planar') {
    return function(a, b) {
      return Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
    };
  }
  if (mode == 'rhumb') {
    return rhumbDistance;
  }
  return function(a, b) { return greatCircleDistance(a[0], a[1], b[0], b[1]); };
}

// Insert vertices so no segment exceeds the interval; endpoints are computed
// independently at even fractions so they land exactly on the interpolated path
// and no rounding drift accumulates.
function densifyPath(coords, interval, interpolate, segmentLength, stats) {
  if (!coords || coords.length < 2) return coords;
  var out = [coords[0]];
  for (var i = 1; i < coords.length; i++) {
    var a = coords[i - 1], b = coords[i];
    var n = Math.ceil(segmentLength(a, b) / interval);
    // A segment that spans a large longitude range but has ~zero length can't be
    // subdivided by this mode (e.g. a -180 -> 180 edge has zero great-circle
    // distance -- the endpoints are the same point on the globe).
    if (n < 2 && stats && Math.abs(b[0] - a[0]) > 180) {
      stats.undividedWideSegments++;
    }
    for (var j = 1; j < n; j++) {
      var p = interpolate(a, b, j / n);
      if (isFinite(p[0]) && isFinite(p[1])) out.push(p); // guard against degenerate math
    }
    out.push(b);
  }
  return out;
}

// Isometric ("Mercator-stretched") latitude in degrees-in; returns +/-Infinity at
// the poles.
function isometricLatitude(latDeg) {
  return Math.log(Math.tan(Math.PI / 4 + latDeg * D2R / 2));
}

// Rhumb-line (loxodrome) interpolation, fraction k of the way from A to B.
// Uses the RAW longitude delta so a -180 -> 180 edge fills the whole parallel
// (the constant-latitude case), rather than collapsing across the antimeridian.
function interpolateRhumbPoint(a, b, k) {
  var lat1 = a[1], lat2 = b[1];
  var dLng = b[0] - a[0]; // raw: preserves a full-longitude sweep
  var lat = lat1 + (lat2 - lat1) * k; // rhumb distance is linear in latitude
  var psi1 = isometricLatitude(lat1);
  var psi2 = isometricLatitude(lat2);
  // Longitude advances linearly with isometric latitude, except along a meridian
  // (dLng == 0), a parallel (lat1 == lat2), or when an endpoint is at a pole
  // (isometric latitude is infinite) -- in those cases longitude is linear in k
  // (and the 0 * Infinity / Infinity would otherwise be NaN).
  var lng = dLng !== 0 && isFinite(psi1) && isFinite(psi2) && psi2 !== psi1 ?
    a[0] + dLng * (isometricLatitude(lat) - psi1) / (psi2 - psi1) :
    a[0] + dLng * k;
  return [lng, lat];
}

// Rhumb-line distance in meters, using the raw longitude delta (so a full-parallel
// sweep returns the parallel's length rather than 0).
export function rhumbDistance(a, b) {
  var phi1 = a[1] * D2R, phi2 = b[1] * D2R;
  var dPhi = phi2 - phi1;
  var dLambda = (b[0] - a[0]) * D2R; // raw
  var dPsi = Math.log(Math.tan(Math.PI / 4 + phi2 / 2) / Math.tan(Math.PI / 4 + phi1 / 2));
  var q = Math.abs(dPsi) > 1e-12 ? dPhi / dPsi : Math.cos(phi1);
  return Math.sqrt(dPhi * dPhi + q * q * dLambda * dLambda) * R;
}
