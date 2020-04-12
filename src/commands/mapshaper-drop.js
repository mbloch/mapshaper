import { pruneArcs } from '../dataset/mapshaper-dataset-utils';
import { deleteHoles } from '../polygons/mapshaper-polygon-holes';
import { layerHasPaths } from '../dataset/mapshaper-layer-utils';
import { fieldListContainsAll } from '../datatable/mapshaper-data-utils';
import cmd from '../mapshaper-cmd';

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
      updateArcs |= layerHasPaths(lyr);
      delete lyr.shapes;
      delete lyr.geometry_type;
    }
    if (opts.holes && lyr.geometry_type == 'polygon') {
      deleteHoles(lyr, dataset.arcs);
    }
    if (deletion) {
      catalog.deleteLayer(lyr, dataset);
    } else if (allFields) {
      delete lyr.data;
    } else if (fields) {
      opts.fields.forEach(lyr.data.deleteField, lyr.data);
    }
  });

  if (updateArcs) {
    pruneArcs(dataset);
  }
};
