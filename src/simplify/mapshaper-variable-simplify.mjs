import { forEachArcId } from '../paths/mapshaper-path-utils';
import { compileFeatureExpression } from '../expressions/mapshaper-feature-expressions';
import { getThresholdFunction } from '../simplify/mapshaper-simplify-pct';
import { finalizeSimplification, convertSimplifyInterval, convertSimplifyResolution,
  simplifyPaths, getStandardSimplifyOpts } from '../commands/mapshaper-simplify';
import { layerHasPaths } from '../dataset/mapshaper-layer-utils';
import { stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';

cmd.variableSimplify = function(layers, dataset, opts) {
  var lyr = layers[0];
  var arcs = dataset.arcs;
  var getShapeThreshold;
  var arcThresholds;
  if (layers.length != 1) {
    stop('Variable simplification requires a single target layer');
  }
  if (!layerHasPaths(lyr)) {
    stop('Target layer is missing path data');
  }

  opts = getStandardSimplifyOpts(dataset, opts);
  simplifyPaths(arcs, opts);

  if (opts.interval) {
    getShapeThreshold = getVariableIntervalFunction(opts.interval, lyr, dataset, opts);
  } else if (opts.percentage) {
    getShapeThreshold = getVariablePercentageFunction(opts.percentage, lyr, dataset, opts);
  } else if (opts.resolution) {
    getShapeThreshold = getVariableResolutionFunction(opts.resolution, lyr, dataset, opts);
  } else {
    stop("Missing a simplification expression");
  }

  arcThresholds = calculateVariableThresholds(lyr, arcs, getShapeThreshold);
  applyArcThresholds(arcs, arcThresholds);
  arcs.setRetainedInterval(1e20); // set to a huge value
  finalizeSimplification(dataset, opts);
  arcs.flatten(); // bake in simplification (different from standard -simplify)
};

function getVariableIntervalFunction(exp, lyr, dataset, opts) {
  var compiled = compileFeatureExpression(exp, lyr, dataset.arcs);
  return function(shpId) {
    var val = compiled(shpId);
    return convertSimplifyInterval(val, dataset, opts);
  };
}

function getVariableResolutionFunction(exp, lyr, dataset, opts) {
  var compiled = compileSimplifyExpression(exp, lyr, dataset.arcs);
  return function(shpId) {
    var val = compiled(shpId);
    return convertSimplifyResolution(val, dataset.arcs, opts);
  };
}

function getVariablePercentageFunction(exp, lyr, dataset, opts) {
  var compiled = compileSimplifyExpression(exp, lyr, dataset.arcs);
  var pctToInterval = getThresholdFunction(dataset.arcs);
  return function(shpId) {
    var val = compiled(shpId);
    var pct = utils.parsePercent(val);
    return pctToInterval(pct);
  };
}

// TODO: memoize?
function compileSimplifyExpression(exp, lyr, arcs) {
  return compileFeatureExpression(exp, lyr, arcs);
}

// Filter arcs based on an array of thresholds
function applyArcThresholds(arcs, thresholds) {
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
}

function calculateVariableThresholds(lyr, arcs, getShapeThreshold) {
  var thresholds = new Float64Array(arcs.size()); // init to 0s
  var UNUSED = -1;
  var currThresh;
  utils.initializeArray(thresholds, UNUSED);
  lyr.shapes.forEach(function(shp, shpId) {
    currThresh = getShapeThreshold(shpId);
    forEachArcId(shp || [], procArc);
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
}
