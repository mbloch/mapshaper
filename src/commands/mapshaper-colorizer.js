import cmd from '../mapshaper-cmd';
import { stop } from '../utils/mapshaper-logging';
import { getStashedVar } from '../mapshaper-stash';
import utils from '../utils/mapshaper-utils';
import { getCategoricalClassifier } from '../classification/mapshaper-categorical-classifier';
import { getDiscreteValueGetter } from '../classification/mapshaper-classification';
import { getDiscreteClassifier } from '../classification/mapshaper-sequential-classifier';
import { getRoundingFunction } from '../geom/mapshaper-rounding';
import { getNonAdjacentClassifier } from '../color/graph-color';

cmd.colorizer = function(opts) {
  if (!opts.name) {
    stop("Missing required name= parameter");
  }
  if (isReservedName(opts.name)) {
    stop('"' + opts.name + '" is a reserved name');
  }
  getStashedVar('defs')[opts.name] = getColorizerFunction(opts);
};

function isReservedName(name) {
  return /^(stroke|stroke-width|stroke-dasharray|stroke-opacity|fill|fill-opacity|opacity|r|class)$/.test(name);
}

export function getColorizerFunction(opts) {
  var nodataColor = opts.nodata || 'white';
  var round = opts.precision ? getRoundingFunction(opts.precision) : null;
  var colorFunction;

  if (!opts.random && (!opts.colors || !opts.colors.length)) {
    stop("Missing colors= parameter");
  }

  if (opts.random) {
    colorFunction = getRandomColorFunction(opts.colors);
  } else if (opts.breaks) {
    if (opts.colors.length != opts.breaks.length + 1) {
      stop("Number of colors should be one more than number of class breaks");
    }
    colorFunction = getSequentialClassifier(opts.breaks, opts.colors, nodataColor, round);
  } else if (opts.categories) {
    if (opts.colors.length != opts.categories.length) {
      stop("Number of colors should be equal to the number of categories");
    }
    colorFunction = getCategoricalClassifier(opts.colors, nodataColor, opts);
  } else {
    stop("Missing categories= or breaks= parameter");
  }

  return colorFunction;
}

function getSequentialClassifier(breaks, colors, nullVal, round) {
  var classify = getDiscreteClassifier(breaks, round);
  var toColor = getDiscreteValueGetter(colors, nullVal);
  return function(val) {
    return toColor(classify(val));
  };
}

function getCategoricalColorFunction(categories, colors, otherVal, nullVal) {
  var classify = getCategoricalClassifier(categories);
  var toColor = getDiscreteValueGetter(colors, nullVal, otherVal);
  return function(val) {
    return toColor(classify(val));
  };
}

function fastStringHash(val) {
  // based on https://github.com/darkskyapp/string-hash (public domain)
  var str = String(val),
      hash = 5381,
      i = str.length;
  while (i > 0) {
    hash = (hash * 33) ^ str.charCodeAt(--i);
  }
  return Math.abs(hash);
}

function getRandomColorFunction(colors) {
  if (!colors || !colors.length) {
    colors = '#ccc,#888,#444'.split(',');
  }
  return function(val) {
    var n = colors.length;
    var i = val === undefined ?
        Math.floor(Math.random() * n) : fastStringHash(val) % n;
    return colors[i];
  };
}
