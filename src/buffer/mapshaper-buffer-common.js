
/* @require mapshaper-units */

internal.dissolveBufferDataset = function(dataset) {
  var lyr = dataset.layers[0];
  var nodes = internal.addIntersectionCuts(dataset, {});
  var mosaicIndex = new MosaicIndex(lyr, nodes, {flat: false, no_holes: false});
  var dissolve = internal.getRingIntersector(mosaicIndex.nodes, 'dissolve');
  var shapes2 = lyr.shapes.map(function(shp, shapeId) {
    var tiles = mosaicIndex.getTilesByShapeIds([shapeId]);
    var rings = [];
    for (var i=0; i<tiles.length; i++) {
      rings.push(tiles[i][0]);
    }
    // return rings;
    return dissolve(rings);
  });
  lyr.shapes = shapes2;
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
