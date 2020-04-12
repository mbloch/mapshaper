import { compileFeatureExpression, compileValueExpression } from '../expressions/mapshaper-expressions';
import { getFeatureCount } from '../dataset/mapshaper-layer-utils';
import { getStateVar } from '../mapshaper-state';
import { DataTable } from '../datatable/mapshaper-data-table';
import cmd from '../mapshaper-cmd';

cmd.evaluateEachFeature = function(lyr, arcs, exp, opts) {
  var n = getFeatureCount(lyr),
      compiled, filter;

  // TODO: consider not creating a data table -- not needed if expression only references geometry
  if (n > 0 && !lyr.data) {
    lyr.data = new DataTable(n);
  }
  if (opts && opts.where) {
    filter = compileValueExpression(opts.where, lyr, arcs);
  }
  compiled = compileFeatureExpression(exp, lyr, arcs, {context: getStateVar('defs')});
  // call compiled expression with id of each record
  for (var i=0; i<n; i++) {
    if (!filter || filter(i)) {
      compiled(i);
    }
  }
};
