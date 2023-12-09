import { compileFeatureExpression } from '../expressions/mapshaper-feature-expressions';
import { getFeatureCount } from '../dataset/mapshaper-layer-utils';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';

cmd.sortFeatures = function(lyr, arcs, opts) {
  var n = getFeatureCount(lyr),
      ascending = !opts.descending,
      compiled = compileFeatureExpression(opts.expression, lyr, arcs),
      values = [];

  utils.repeat(n, function(i) {
    values.push(compiled(i));
  });

  var ids = utils.getSortedIds(values, ascending);
  if (lyr.shapes) {
    utils.reorderArray(lyr.shapes, ids);
  }
  if (lyr.data) {
    utils.reorderArray(lyr.data.getRecords(), ids);
  }
};
