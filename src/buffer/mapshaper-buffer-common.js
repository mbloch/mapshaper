
/* @require mapshaper-units, mapshaper-polygon-dissolve */

internal.dissolveBufferDataset = function(dataset, optsArg) {
  var opts = optsArg || {};
  var lyr = dataset.layers[0];
  var tmp;
  var nodes = internal.addIntersectionCuts(dataset, {});
  if (opts.debug_division) {
    return internal.debugBufferDivision(lyr, nodes);
  }
  var mosaicIndex = new MosaicIndex(lyr, nodes, {flat: false, no_holes: true});
  if (opts.debug_mosaic) {
    tmp = internal.composeMosaicLayer(lyr, mosaicIndex.mosaic);
    lyr.shapes = tmp.shapes;
    lyr.data = tmp.data;
    return;
  }
  var dissolve = internal.getRingIntersector(mosaicIndex.nodes, 'dissolve');
  // var dissolve = internal.getBufferTileDissolver(); // alternate dissolve (same as -dissolve command)
  var shapes2 = lyr.shapes.map(function(shp, shapeId) {
    var tiles = mosaicIndex.getTilesByShapeIds([shapeId]);
    var rings = [];
    for (var i=0; i<tiles.length; i++) {
      rings.push(tiles[i][0]);
    }
    // return rings;
    return dissolve(rings);
  });
  // shapes2 = mosaicIndex.mosaic
  lyr.shapes = shapes2;
};

internal.debugBufferDivision = function(lyr, nodes) {
  var divide = internal.getHoleDivider(nodes);
  var shapes2 = [];
  lyr.data = null;
  lyr.shapes.forEach(divideShape);
  lyr.shapes = shapes2;
  return lyr;

  function divideShape(shp) {
    var cw = [], ccw = [];
    divide(shp, cw, ccw);
    // include holes?
    //ccw.forEach(internal.reversePath);
    // cw = cw.concat(ccw);
    cw.forEach(function(ring) {
      shapes2.push([ring]);
    });
  }
};

internal.getBufferTileDissolver = function() {
  return function(rings) {
    return dissolvePolygonGeometry([rings], function(i) {return 0;})[0];
  };
};

// return constant distance in meters, or return null if unparsable
internal.parseConstantBufferDistance = function(str, crs) {
  var parsed = internal.parseMeasure2(str);
  if (!parsed.value) return null;
  return internal.convertDistanceParam(str, crs) || null;
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
