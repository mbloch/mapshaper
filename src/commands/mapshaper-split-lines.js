
import cmd from '../mapshaper-cmd';
import { stop, error } from '../utils/mapshaper-logging';
import { convertDistanceParam } from '../geom/mapshaper-units';
import { isLatLngCRS , getDatasetCRS } from '../crs/mapshaper-projections';
import { requirePolylineLayer, getFeatureCount } from '../dataset/mapshaper-layer-utils';
import { getFeatureEditor } from '../expressions/mapshaper-each-geojson';
import { compileFeatureExpression, compileValueExpression } from '../expressions/mapshaper-expressions';
import { replaceLayerContents } from '../dataset/mapshaper-dataset-utils';
import { pointSegDistSq2, greatCircleDistance, distance2D } from '../geom/mapshaper-basic-geom';
import { getInterpolationFunction } from '../geom/mapshaper-geodesic';

cmd.splitLines = function(lyr, dataset, opts) {
  var crs = getDatasetCRS(dataset);
  requirePolylineLayer(lyr);
  var splitFeature = getSplitFeatureFunction(crs, opts);

  // TODO: remove duplication with mapshaper-each.js
  var editor = getFeatureEditor(lyr, dataset);
  var exprOpts = {
    geojson_editor: editor,
    context: {splitFeature}
  };
  var exp = `this.geojson = splitFeature(this.geojson)`;

  var compiled = compileFeatureExpression(exp, lyr, dataset.arcs, exprOpts);
  var n = getFeatureCount(lyr);
  var filter;
  if (opts && opts.where) {
    filter = compileValueExpression(opts.where, lyr, dataset.arcs);
  }
  for (var i=0; i<n; i++) {
    if (!filter || filter(i)) {
      compiled(i);
    }
  }
  replaceLayerContents(lyr, dataset, editor.done());
};

function getSplitFeatureFunction(crs, opts) {
  var dashLen = opts.dash_length ? convertDistanceParam(opts.dash_length, crs) : 0;
  var gapLen = opts.gap_length ? convertDistanceParam(opts.gap_length, crs) : 0;
  if (dashLen > 0 === false) {
    stop('Missing required segment-length parameter');
  }
  if (gapLen >= 0 == false) {
    stop('Invalid gap-length option');
  }
  var splitLine = getSplitLineFunction(crs, dashLen, gapLen, !!opts.planar);
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

function getSplitLineFunction(crs, dashLen, gapLen, planar) {
  var interpolate = getInterpolationFunction(planar ? null : crs);
  var distance =  isLatLngCRS(crs) ? greatCircleDistance : distance2D;
  var inDash, parts2, interval;
  function addPart(coords) {
    if (inDash) parts2.push(coords);
    if (gapLen > 0) {
      inDash = !inDash;
      interval = inDash ? dashLen : gapLen;
    }
  }
  return function splitLineString(coords) {
    var elapsedDist = 0;
    var p = coords[0];
    var coords2 = [p];
    var segLen, k, prev;
    // init this LineString
    inDash = true;
    parts2 = [];
    interval = gapLen;
    for (var i=1, n=coords.length; i<n; i++) {
      prev = p;
      p = coords[i];
      segLen = distance(prev[0], prev[1], p[0], p[1]);
      while (elapsedDist + segLen >= interval) {
        k = (interval - elapsedDist) / segLen;
        prev = interpolate(prev[0], prev[1], p[0], p[1], k);
        elapsedDist = 0;
        coords2.push(prev);
        addPart(coords2);
        coords2 = [prev];
        segLen = distance(prev[0], prev[1], p[0], p[1]);
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
