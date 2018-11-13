/*   */

api.variableSimplify = function(layers, dataset, opts) {
  var lyr = layers[0];
  var getShapeThreshold;
  if (layers.length != 1) {
    stop('Variable simplification requires a single target layer');
  }
  if (!internal.layerHasPaths(lyr)) {
    stop('Target layer is missing path data');
  }

  if (opts.interval) {
    getShapeThreshold = internal.getVariableIntervalFunction(lyr, arcs, opts.interval);
  } else if (opts.percentage) {
    getShapeThreshold = internal.getVariablePercentageFunction(lyr, arcs, opts.percentage);
  } else if (opts.resolution) {
    getShapeThreshold = internal.getVariableResolutionFunction(lyr, arcs, opts.resolution);
  } else {
    stop("Missing a simplification expression");
  }

};

internal.getVariableIntervalFunction = function(lyr, arcs, expr) {

};

internal.getVariableResolutionFunction = function(lyr, arcs, expr) {

};

internal.getVariablePercentageFunction = function(lyr, arcs, expr) {

};


internal.calculateVariableThresholds = function() {


};
