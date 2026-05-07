import { pruneArcs } from '../dataset/mapshaper-dataset-utils';
import { deleteHoles } from '../polygons/mapshaper-polygon-holes';
import { layerHasPaths } from '../dataset/mapshaper-layer-utils';
import { fieldListContainsAll } from '../datatable/mapshaper-data-utils';
import cmd from '../mapshaper-cmd';
import { markLayerChanged, noteLayerWillChange } from '../undo/mapshaper-undo-tracking';

cmd.drop2 = function(catalog, targets, opts) {
  targets.forEach(function(target) {
    cmd.drop(catalog, target.layers, target.dataset, opts);
  });
};

cmd.drop = function(catalog, layers, dataset, opts) {
  var updateArcs = false;

  layers.forEach(function(lyr) {
    var fields = lyr.data && opts.fields;
    var allFields = fields && fieldListContainsAll(fields, lyr.data.getFields());
    var deletion = !fields && !opts.geometry && !opts.holes || allFields && opts.geometry;
    if (opts.geometry) {
      noteLayerWillChange(lyr, {operation: 'drop-geometry'});
      updateArcs |= layerHasPaths(lyr);
      delete lyr.shapes;
      delete lyr.geometry_type;
      markLayerChanged(lyr, {operation: 'drop-geometry'});
    }
    if (opts.holes && lyr.geometry_type == 'polygon') {
      noteLayerWillChange(lyr, {operation: 'drop-holes'});
      deleteHoles(lyr, dataset.arcs);
      markLayerChanged(lyr, {operation: 'drop-holes'});
    }
    if (deletion) {
      catalog.deleteLayer(lyr, dataset);
    } else if (allFields) {
      noteLayerWillChange(lyr, {operation: 'drop-fields'});
      delete lyr.data;
      markLayerChanged(lyr, {operation: 'drop-fields'});
    } else if (fields) {
      opts.fields.forEach(lyr.data.deleteField, lyr.data);
    }
  });

  if (updateArcs) {
    pruneArcs(dataset);
  }
};
