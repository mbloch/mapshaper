import { compileFeatureExpression } from '../expressions/mapshaper-feature-expressions';
import { getFeatureCount } from '../dataset/mapshaper-layer-utils';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';
import {
  markLayerOrderChanged,
  markTableOrderChanged,
  noteLayerOrderWillChange,
  noteTableOrderWillChange
} from '../undo/mapshaper-undo-tracking';

cmd.sortFeatures = function(lyr, arcs, opts) {
  var n = getFeatureCount(lyr),
      ascending = !opts.descending,
      compiled = compileFeatureExpression(opts.expression, lyr, arcs),
      values = [];

  utils.repeat(n, function(i) {
    values.push(compiled(i));
  });

  var ids = utils.getSortedIds(values, ascending);
  var undoIds = invertIds(ids);
  if (lyr.shapes) {
    noteLayerOrderWillChange(lyr, undoIds, {operation: 'sort'});
    utils.reorderArray(lyr.shapes, ids);
    markLayerOrderChanged(lyr, ids, {operation: 'sort'});
  }
  if (lyr.data) {
    noteTableOrderWillChange(lyr.data, undoIds, {operation: 'sort'});
    utils.reorderArray(lyr.data.getRecords(), ids);
    markTableOrderChanged(lyr.data, ids, {operation: 'sort'});
  }
};

function invertIds(ids) {
  var inverse = [];
  ids.forEach(function(id, i) {
    inverse[id] = i;
  });
  return inverse;
}
