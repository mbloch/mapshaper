/* @requires mapshaper-lines */

api.innerlines = function(lyr, arcs, opts) {
  opts = opts || {};
  internal.requirePolygonLayer(lyr);
  var filter = opts.where ? internal.compileFeaturePairFilterExpression(opts.where, lyr, arcs) : null;
  var classifier = internal.getArcClassifier(lyr.shapes, arcs, {filter: filter});
  var lines = internal.extractInnerLines(lyr.shapes, classifier);
  var outputLyr = internal.createLineLayer(lines, null);

  if (lines.length === 0) {
    message("No shared boundaries were found");
  }
  outputLyr.name = opts.no_replace ? null : lyr.name;
  return outputLyr;
};
