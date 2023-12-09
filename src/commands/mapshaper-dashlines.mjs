
import cmd from '../mapshaper-cmd';
import { stop, error } from '../utils/mapshaper-logging';
import { convertDistanceParam } from '../geom/mapshaper-units';
import { isLatLngCRS , getDatasetCRS } from '../crs/mapshaper-projections';
import { requirePolylineLayer, getFeatureCount } from '../dataset/mapshaper-layer-utils';
import { getFeatureEditor } from '../expressions/mapshaper-each-geojson';
import { replaceLayerContents } from '../dataset/mapshaper-dataset-utils';
import { greatCircleDistance, distance2D } from '../geom/mapshaper-basic-geom';
import { getInterpolationFunction } from '../geom/mapshaper-geodesic';
import { getStashedVar } from '../mapshaper-stash';

cmd.dashlines = function(lyr, dataset, opts) {
  var crs = getDatasetCRS(dataset);
  var defs = getStashedVar('defs');
  var exp = `this.geojson = splitFeature(this.geojson)`;
  requirePolylineLayer(lyr);
  defs.splitFeature = getSplitFeatureFunction(crs, opts);
  cmd.evaluateEachFeature(lyr, dataset, exp, opts);
  delete defs.splitFeature;
};

function getSplitFeatureFunction(crs, opts) {
  var dashLen = opts.dash_length ? convertDistanceParam(opts.dash_length, crs) : 0;
  var gapLen = opts.gap_length ? convertDistanceParam(opts.gap_length, crs) : 0;
  if (dashLen > 0 === false) {
    stop('Missing required dash-length parameter');
  }
  if (gapLen >= 0 == false) {
    stop('Invalid gap-length option');
  }
  var splitLine = getSplitLineFunction(crs, dashLen, gapLen, opts);
  return function(feat) {
    var geom = feat.geometry;
    if (!geom) return feat;
    if (geom.type == 'LineString') {
      geom.type = 'MultiLineString';
      geom.coordinates = [geom.coordinates];
    }
    if (geom.type != 'MultiLineString') {
      error('Unexpected geometry:', geom.type);
    }
    geom.coordinates = geom.coordinates.reduce(function(memo, coords) {
      try {
        var parts = splitLine(coords);
        memo = memo.concat(parts);
      } catch(e) {
        console.error(e);
        throw e;
      }
      return memo;
    }, []);

    return feat;
  };
}

function getSplitLineFunction(crs, dashLen, gapLen, opts) {
  var planar = !!opts.planar;
  var interpolate = getInterpolationFunction(planar ? null : crs);
  var distance =  isLatLngCRS(crs) ? greatCircleDistance : distance2D;
  var inDash, parts2, interval, scale;
  function addPart(coords) {
    if (inDash) parts2.push(coords);
    if (gapLen > 0) {
      inDash = !inDash;
      interval = scale * (inDash ? dashLen : gapLen);
    }
  }

  return function splitLineString(coords) {
    var elapsedDist = 0;
    var p = coords[0];
    var coords2 = [p];
    var segLen, pct, prev;
    if (opts.scaled) {
      scale = scaleDashes(dashLen, gapLen, getLineLength(coords, distance));
    } else {
      scale = 1;
    }
    // init this LineString
    inDash = gapLen > 0 ? false : true;
    interval = scale * (inDash ? dashLen : gapLen);
    if (!inDash) {
      // start gapped lines with a half-gap
      // (a half-gap or a half-dash is probably better for rings and intersecting lines)
      interval *= 0.5;
    }
    parts2 = [];
    for (var i=1, n=coords.length; i<n; i++) {
      prev = p;
      p = coords[i];
      segLen = distance(prev[0], prev[1], p[0], p[1]);
      if (segLen <= 0) continue;
      while (elapsedDist + segLen >= interval) {
        // this segment contains a break either within it or at the far endpoint
        pct = (interval - elapsedDist) / segLen;
        if (pct > 0.999 && i == n - 1) {
          // snap to endpoint (so fp rounding errors don't result in a tiny
          // last segment)
          pct = 1;
        }
        if (pct < 1) {
          prev = interpolate(prev[0], prev[1], p[0], p[1], pct);
        } else {
          prev = p;
        }
        coords2.push(prev);
        addPart(coords2);
        // start a new part
        coords2 = pct < 1 ? [prev] : [];
        elapsedDist = 0;
        segLen = (1 - pct) * segLen;
      }
      coords2.push(p);
      elapsedDist += segLen;
    }
    if (elapsedDist > 0 && coords2.length > 1) {
      addPart(coords2);
    }
    return parts2;
  };
}

function getLineLength(coords, distance) {
  var len = 0;
  for (var i=1, n=coords.length; i<n; i++) {
    len += distance(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]);
  }
  return len;
}

function scaleDashes(dash, gap, len) {
  var dash2, gap2;
  var n = len / (dash + gap); // number of dashes
  var n1 = Math.floor(n);
  var n2 = Math.ceil(n);
  var k1 = len / (n1 * (dash + gap)); // scaled-up dashes, >1
  var k2 = len / (n2 * (dash + gap)); // scaled-down dashes <1
  var k = k2;
  if (k1 < 1/k2 && n1 > 0) {
    k = k1; // pick the smaller of the two scales
  }
  return k;
}
