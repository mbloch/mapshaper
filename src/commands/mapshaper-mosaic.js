/* @requires mapshaper-polygon-mosaic */

api.mosaic = function(layers, dataset, opts) {
  var lyr = layers[0];
  if (!lyr || layers.length > 1) {
    stop('Command takes a single target layer');
  }
  internal.requirePolygonLayer(lyr);
  var nodes = internal.addIntersectionCuts(dataset, opts);
  var mosaicIndex = new MosaicIndex(lyr, nodes, {flat: false});
  var mosaicShapes = mosaicIndex.mosaic;
  var records2;

  var lyr2 = {
    name: 'name' in lyr ? lyr.name : undefined,
    shapes: mosaicShapes,
    geometry_type: 'polygon',
  };

  if (opts.calc) {
    records2 = internal.recombineDataRecords(lyr.data.getRecords(), mosaicIndex.getSourceIdsByTileId, mosaicShapes.length, opts);
    lyr2.data = new DataTable(records2);
  }

  return [lyr2];
};
