import { compileFeatureExpression } from '../expressions/mapshaper-feature-expressions';
import { getDatasetCRS } from '../crs/mapshaper-projections';
import { convertDistanceParam } from '../geom/mapshaper-units';
import { parseMeasure2 } from '../geom/mapshaper-units';
import { reversePath } from '../paths/mapshaper-path-utils';
import { getHoleDivider } from '../polygons/mapshaper-polygon-holes';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';
import { getRingIntersector } from '../paths/mapshaper-pathfinder';
import { composeMosaicLayer } from '../dissolve/mapshaper-polygon-dissolve2';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { stop } from '../utils/mapshaper-logging';
import { DataTable } from '../datatable/mapshaper-data-table';
import { MosaicIndex } from '../polygons/mapshaper-mosaic-index';

export function dissolveBufferDataset(dataset, optsArg) {
  var opts = optsArg || {};
  var lyr = dataset.layers[0];
  var tmp;
  var nodes = addIntersectionCuts(dataset, {});
  if (opts.debug_division) {
    return debugBufferDivision(lyr, nodes);
  }
  var mosaicIndex = new MosaicIndex(lyr, nodes, {flat: false, no_holes: false});
  if (opts.debug_mosaic) {
    tmp = composeMosaicLayer(lyr, mosaicIndex.mosaic);
    lyr.shapes = tmp.shapes;
    lyr.data = tmp.data;
    return;
  }
  var pathfind = getRingIntersector(mosaicIndex.nodes);
  var shapes2 = lyr.shapes.map(function(shp, shapeId) {
    var tiles = mosaicIndex.getTilesByShapeIds([shapeId]);
    var rings = [];
    for (var i=0; i<tiles.length; i++) {
      rings.push(tiles[i][0]);
    }
    return pathfind(rings, 'dissolve');
  });
  lyr.shapes = shapes2;
  if (!opts.no_dissolve) {
    dissolveArcs(dataset);
  }
}

function debugBufferDivision(lyr, nodes) {
  var divide = getHoleDivider(nodes);
  var shapes2 = [];
  var records = [];
  lyr.shapes.forEach(divideShape);
  lyr.shapes = shapes2;
  lyr.data = new DataTable(records);
  return lyr;

  function divideShape(shp) {
    var cw = [], ccw = [];
    divide(shp, cw, ccw);
    cw.forEach(function(ring) {
      shapes2.push([ring]);
      records.push({type: 'ring'});
    });
    ccw.forEach(function(hole) {
      shapes2.push([reversePath(hole)]);
      records.push({type: 'hole'});
    });
  }
}

// n = number of segments used to approximate a circle
// Returns tolerance as a percent of circle radius
export function getBufferToleranceFromCircleSegments(n) {
  return 1 - Math.cos(Math.PI / n);
}

export function getArcDegreesFromTolerancePct(pct) {
  return 360 * Math.acos(1 - pct) / Math.PI;
}

// n = number of segments used to approximate a circle
// Returns tolerance as a percent of circle radius
export function getBufferToleranceFromCircleSegments2(n) {
  return 1 / Math.cos(Math.PI / n) - 1;
}

export function getArcDegreesFromTolerancePct2(pct) {
  return 360 * Math.acos(1 / (pct + 1)) / Math.PI;
}

// return constant distance in meters, or return null if unparsable
export function parseConstantBufferDistance(str, crs) {
  var parsed = parseMeasure2(str);
  if (!parsed.value) return null;
  return convertDistanceParam(str, crs) || null;
}

export function getBufferToleranceFunction(dataset, opts) {
  var crs = getDatasetCRS(dataset);
  var constTol = opts.tolerance ? parseConstantBufferDistance(opts.tolerance, crs) : 0;
  var pctOfRadius = 1/100;
  return function(meterDist) {
    if (constTol) return constTol;
    return constTol ? constTol : meterDist * pctOfRadius;
  };
}

export function getBufferDistanceFunction(lyr, dataset, opts) {
  if (!opts.radius) {
    stop('Missing expected radius parameter');
  }
  var unitStr = opts.units || '';
  var crs = getDatasetCRS(dataset);
  var constDist = parseConstantBufferDistance(opts.radius + unitStr, crs);
  if (constDist) return function() {return constDist;};
  var expr = compileFeatureExpression(opts.radius, lyr, null); // no arcs
  return function(shpId) {
    var val = expr(shpId);
    if (!val) return 0;
    // TODO: optimize common case that expression returns a number
    var dist = parseConstantBufferDistance(val + unitStr, crs);
    return dist || 0;
  };
}
