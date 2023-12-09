import { compileFeatureExpression } from '../expressions/mapshaper-feature-expressions';
import { getFeatureCount } from '../dataset/mapshaper-layer-utils';
import { DataTable } from '../datatable/mapshaper-data-table';
import { expressionUsesGeoJSON, getFeatureEditor } from '../expressions/mapshaper-each-geojson';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';
import { replaceLayerContents } from '../dataset/mapshaper-dataset-utils';

import cmd from '../mapshaper-cmd';

cmd.evaluateEachFeature = function(lyr, dataset, exp, opts) {
  var n = getFeatureCount(lyr),
      arcs = dataset.arcs,
      compiled, filter;

  var exprOpts = {
    no_return: true,
    geojson_editor: expressionUsesGeoJSON(exp) ? getFeatureEditor(lyr, dataset) : null
  };

  // TODO: consider not creating a data table -- not needed if expression only references geometry
  if (n > 0 && !lyr.data) {
    lyr.data = new DataTable(n);
  }
  if (opts && opts.where) {
    filter = compileFeatureExpression(opts.where, lyr, arcs);
  }
  compiled = compileFeatureExpression(exp, lyr, arcs, exprOpts);
  // call compiled expression with id of each record
  for (var i=0; i<n; i++) {
    if (!filter || filter(i)) {
      compiled(i);
    }
  }

  var replacement = exprOpts.geojson_editor ? exprOpts.geojson_editor.done() : null;
  if (replacement) {
    replaceLayerContents(lyr, dataset, replacement);
  }
};
