import { createLineLayer } from '../commands/mapshaper-lines';
import { extractInnerLines } from '../commands/mapshaper-lines';
import { getArcClassifier } from '../topology/mapshaper-arc-classifier';
import { compileFeaturePairFilterExpression } from '../expressions/mapshaper-feature-expressions';
import { requirePolygonLayer, setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import cmd from '../mapshaper-cmd';
import { message } from '../utils/mapshaper-logging';

cmd.innerlines = function(lyr, arcs, opts) {
  opts = opts || {};
  requirePolygonLayer(lyr);
  var filter = opts.where ? compileFeaturePairFilterExpression(opts.where, lyr, arcs) : null;
  var classifier = getArcClassifier(lyr.shapes, arcs, {filter: filter});
  var lines = extractInnerLines(lyr.shapes, classifier);
  var outputLyr = createLineLayer(lines, null);

  if (lines.length === 0) {
    message("No shared boundaries were found");
  }
  setOutputLayerName(outputLyr, lyr, null, opts);
  return outputLyr;
};
