
/* @require
mapshaper-units
mapshaper-polygon-dissolve
mapshaper-arc-dissolve
*/

internal.dissolveBufferDataset = function(dataset, optsArg) {
  var opts = optsArg || {};
  var lyr = dataset.layers[0];
  var tmp;
  var nodes = internal.addIntersectionCuts(dataset, {});
  if (opts.debug_division) {
    return internal.debugBufferDivision(lyr, nodes);
  }
  var mosaicIndex = new MosaicIndex(lyr, nodes, {flat: false, no_holes: false});
  if (opts.debug_mosaic) {
    tmp = internal.composeMosaicLayer(lyr, mosaicIndex.mosaic);
    lyr.shapes = tmp.shapes;
    lyr.data = tmp.data;
    return;
  }
  var pathfind = internal.getRingIntersector(mosaicIndex.nodes);
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
    internal.dissolveArcs(dataset);
  }
};

internal.debugBufferDivision = function(lyr, nodes) {
  var divide = internal.getHoleDivider(nodes);
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
      shapes2.push([internal.reversePath(hole)]);
      records.push({type: 'hole'});
    });
  }
};

internal.getBufferTileDissolver = function() {
  return function(rings) {
    return dissolvePolygonGeometry([rings], function(i) {return 0;})[0];
  };
};

// n = number of segments used to approximate a circle
// Returns tolerance as a percent of circle radius
internal.getBufferToleranceFromCircleSegments = function(n) {
  return 1 - Math.cos(Math.PI / n);
};

internal.getArcDegreesFromTolerancePct = function(pct) {
  return 360 * Math.acos(1 - pct) / Math.PI;
};

// n = number of segments used to approximate a circle
// Returns tolerance as a percent of circle radius
internal.getBufferToleranceFromCircleSegments2 = function(n) {
  return 1 / Math.cos(Math.PI / n) - 1;
};

internal.getArcDegreesFromTolerancePct2 = function(pct) {
  return 360 * Math.acos(1 / (pct + 1)) / Math.PI;
};

// return constant distance in meters, or return null if unparsable
internal.parseConstantBufferDistance = function(str, crs) {
  var parsed = internal.parseMeasure2(str);
  if (!parsed.value) return null;
  return internal.convertDistanceParam(str, crs) || null;
};

internal.getBufferToleranceFunction = function(dataset, opts) {
  var crs = internal.getDatasetCRS(dataset);
  var constTol = opts.tolerance ? internal.parseConstantBufferDistance(opts.tolerance, crs) : 0;
  var pctOfRadius = 1/100;
  return function(meterDist) {
    if (constTol) return constTol;
    return constTol ? constTol : meterDist * pctOfRadius;
  };

};

internal.getBufferDistanceFunction = function(lyr, dataset, opts) {
  if (!opts.radius) {
    stop('Missing expected radius parameter');
  }
  var unitStr = opts.units || '';
  var crs = internal.getDatasetCRS(dataset);
  var constDist = internal.parseConstantBufferDistance(opts.radius + unitStr, crs);
  if (constDist) return function() {return constDist;};
  var expr = internal.compileValueExpression(opts.radius, lyr, null, {}); // no arcs
  return function(shpId) {
    var val = expr(shpId);
    if (!val) return 0;
    // TODO: optimize common case that expression returns a number
    var dist = internal.parseConstantBufferDistance(val + unitStr, crs);
    return dist || 0;
  };
};
