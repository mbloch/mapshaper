import { buildTopology } from '../topology/mapshaper-topology';
import { ArcCollection } from '../paths/mapshaper-arcs';
import { stop, error } from '../utils/mapshaper-logging';
import {
  markDatasetChanged,
  markLayerChanged,
  noteDatasetWillChange,
  noteLayerWillChange,
  withActiveUndoTransaction
} from '../undo/mapshaper-undo-tracking';

export function DatasetEditor(dataset) {
  var layers = [];
  var arcs = [];

  this.done = function() {
    dataset.layers = layers;
    if (arcs.length) {
      noteDatasetWillChange(dataset, {operation: 'DatasetEditor.done', unit: 'arcs'});
      dataset.arcs = new ArcCollection(arcs);
      markDatasetChanged(dataset, {operation: 'DatasetEditor.done', unit: 'arcs'});
      withActiveUndoTransaction(null, function() {
        buildTopology(dataset);
      });
    }
  };

  this.editLayer = function(lyr, cb) {
    var type = lyr.geometry_type;
    if (dataset.layers.indexOf(lyr) != layers.length) {
      error('Layer was edited out-of-order');
    }
    if (!type) {
      layers.push(lyr);
      return;
    }
    var shapes = lyr.shapes.map(function(shape, shpId) {
      var shape2 = [], retn, input;
      for (var i=0, n=shape ? shape.length : 0; i<n; i++) {
        input = type == 'point' ? shape[i] : idsToCoords(shape[i]);
        retn = cb(input, i, shape);
        if (!Array.isArray(retn)) continue;
        if (type == 'point') {
          shape2.push(retn);
        } else if (type == 'polygon' || type == 'polyline') {
          extendPathShape(shape2, retn || []);
        }
      }
      return shape2.length > 0 ? shape2 : null;
    });
    noteLayerWillChange(lyr, {operation: 'DatasetEditor.editLayer', unit: 'shapes'});
    layers.push(Object.assign(lyr, {shapes: shapes}));
    markLayerChanged(lyr, {operation: 'DatasetEditor.editLayer', unit: 'shapes'});
  };

  function extendPathShape(shape, parts) {
    for (var i=0; i<parts.length; i++) {
      shape.push([arcs.length]);
      arcs.push(parts[i]);
    }
  }

  function idsToCoords(ids) {
    var coords = [];
    var iter = dataset.arcs.getShapeIter(ids);
    while (iter.hasNext()) {
      coords.push([iter.x, iter.y]);
    }
    return coords;
  }
}
