import { recombineDataRecords } from '../dissolve/mapshaper-data-aggregation';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { requirePolygonLayer, initDataTable } from '../dataset/mapshaper-layer-utils';
import cmd from '../mapshaper-cmd';
import { stop } from '../utils/mapshaper-logging';
import { DataTable } from '../datatable/mapshaper-data-table';
import { MosaicIndex } from '../polygons/mapshaper-mosaic-index';

cmd.mosaic = function(layers, dataset, opts) {
  var lyr = layers[0];
  if (!lyr || layers.length > 1) {
    stop('Command takes a single target layer');
  }
  requirePolygonLayer(lyr);
  var nodes = addIntersectionCuts(dataset, opts);
  var mosaicIndex = new MosaicIndex(lyr, nodes, {flat: false});
  var mosaicShapes = mosaicIndex.mosaic;
  var records2;

  var lyr2 = {
    name: 'name' in lyr ? lyr.name : undefined,
    shapes: mosaicShapes,
    geometry_type: 'polygon',
  };

  if (opts.calc) {
    if (!lyr.data) initDataTable(lyr);
    records2 = recombineDataRecords(lyr.data.getRecords(), mosaicIndex.getSourceIdsByTileId, mosaicShapes.length, opts);
    lyr2.data = new DataTable(records2);
  }

  return [lyr2];
};
