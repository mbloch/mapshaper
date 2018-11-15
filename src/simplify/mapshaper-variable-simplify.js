/* @requires mapshaper-simplify-pct */

api.variableSimplify = function(layers, dataset, opts) {
  var lyr = layers[0];
  var arcs = dataset.arcs;
  var getShapeThreshold;
  var arcThresholds;
  if (layers.length != 1) {
    stop('Variable simplification requires a single target layer');
  }
  if (!internal.layerHasPaths(lyr)) {
    stop('Target layer is missing path data');
  }

  opts = internal.getStandardSimplifyOpts(dataset, opts);
  internal.simplifyPaths(arcs, opts);

  if (opts.interval) {
    getShapeThreshold = internal.getVariableIntervalFunction(opts.interval, lyr, dataset, opts);
  } else if (opts.percentage) {
    getShapeThreshold = internal.getVariablePercentageFunction(opts.percentage, lyr, dataset, opts);
  } else if (opts.resolution) {
    getShapeThreshold = internal.getVariableResolutionFunction(opts.resolution, lyr, dataset, opts);
  } else {
    stop("Missing a simplification expression");
  }

  arcThresholds = internal.calculateVariableThresholds(lyr, arcs, getShapeThreshold);
  internal.applyArcThresholds(arcs, arcThresholds);
  arcs.setRetainedInterval(1e20); // set to a huge value
  internal.finalizeSimplification(dataset, opts);
  arcs.flatten(); // bake in simplification (different from standard -simplify)
};

internal.getVariableIntervalFunction = function(exp, lyr, dataset, opts) {
  var compiled = internal.compileSimplifyExpression(exp, lyr, dataset.arcs);
  return function(shpId) {
    var val = compiled(shpId);
    return internal.convertSimplifyInterval(val, dataset, opts);
  };
};

internal.getVariableResolutionFunction = function(exp, lyr, dataset, opts) {
  var compiled = internal.compileSimplifyExpression(exp, lyr, dataset.arcs);
  return function(shpId) {
    var val = compiled(shpId);
    return internal.convertSimplifyResolution(val, dataset.arcs, opts);
  };
};

internal.getVariablePercentageFunction = function(exp, lyr, dataset, opts) {
  var compiled = internal.compileSimplifyExpression(exp, lyr, dataset.arcs);
  var pctToInterval = internal.getThresholdFunction(dataset.arcs);
  return function(shpId) {
    var val = compiled(shpId);
    var pct = utils.parsePercent(val);
    return pctToInterval(pct);
  };
};

// TODO: memoize?
internal.compileSimplifyExpression = function(exp, lyr, arcs) {
  return internal.compileValueExpression(exp, lyr, arcs);
};

// Filter arcs based on an array of thresholds
internal.applyArcThresholds = function(arcs, thresholds) {
  var zz = arcs.getVertexData().zz;
  arcs.forEach2(function(start, n, xx, yy, zz, arcId) {
    var arcZ = thresholds[arcId];
    var z;
    for (var i=1; i<n-1; i++) {
      z = zz[start + i];
      // if (z >= arcZ || arcZ === Infinity) { // Infinity test is a bug
      if (z >= arcZ) {
        // protect vertices with thresholds that are >= than the computed threshold
        // for this arc
        zz[start + i] = Infinity;
      }
    }
  });
};

internal.calculateVariableThresholds = function(lyr, arcs, getShapeThreshold) {
  var thresholds = new Float64Array(arcs.size()); // init to 0s
  var UNUSED = -1;
  var currThresh;
  utils.initializeArray(thresholds, UNUSED);
  lyr.shapes.forEach(function(shp, shpId) {
    currThresh = getShapeThreshold(shpId);
    internal.forEachArcId(shp || [], procArc);
  });
  // set unset arcs to 0 so they are not simplified
  for (var i=0, n=thresholds.length; i<n; i++) {
    if (thresholds[i] == UNUSED) {
      thresholds[i] = 0;
    }
  }
  return thresholds;

  function procArc(arcId) {
    var i = arcId < 0 ? ~arcId : arcId;
    var savedThresh = thresholds[i];
    if (savedThresh > currThresh || savedThresh == UNUSED) {
      thresholds[i] = currThresh;
    }
  }
};
