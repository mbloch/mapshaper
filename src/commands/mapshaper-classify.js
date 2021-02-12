import { stop, message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { requireDataField } from '../dataset/mapshaper-layer-utils';
import { getRoundingFunction } from '../geom/mapshaper-rounding';
import { getFieldValues } from '../datatable/mapshaper-data-utils';
import { isColorSchemeName, getColorRamp, getCategoricalColorScheme } from '../color/color-schemes';
import {
  getSequentialClassifier,
  getContinuousClassifier,
  getCategoricalClassifier,
  getQuantileBreaks,
  getEqualIntervalBreaks,
  getHybridBreaks,
  getClassId,
  getDataRange,
  interpolateValuesToClasses,
  getDistributionData,
  getDiscreteValueGetter,
  getInterpolatedValueGetter
} from '../classification/mapshaper-classification';
import { getNiceBreaks } from '../classification/mapshaper-nice-breaks';
import cmd from '../mapshaper-cmd';

cmd.classify = function(lyr, optsArg) {
  var opts = optsArg || {};
  var dataField = opts.field;
  requireDataField(lyr.data, dataField);
  var records = lyr.data && lyr.data.getRecords();
  var dataValues = getFieldValues(records, dataField);
  var colorScheme = opts.color_scheme || null;
  var classes = opts.classes || null; // number of classes
  var nullValue = opts.null_value || null;
  var looksLikeColors = !!opts.colors || !!opts.color_scheme;
  var classValues, classify, classToValue, outputField;

  if (opts.breaks) {
    // TODO: check for invalid combinations of breaks= and classes= options
    classes = opts.breaks.length + 1;
  }

  if (colorScheme) {
    // using a named color scheme: generate a ramp
    if (!isColorSchemeName(colorScheme)) {
      stop('Unknown color scheme:', colorScheme);
    }
    if (opts.categories) {
      classValues = getCategoricalColorScheme(colorScheme, opts.categories.length);
      message('Colors:', formatValuesForLogging(classValues));
      classes = classValues.length;
    } else {
      if (classes > 0 === false) {
        // stop('color-scheme= option requires classes= or breaks=');
        classes = 4; // use a default number of classes
      }
      classValues = getColorRamp(colorScheme, classes);
    }

  } else if (opts.colors) {
    classValues = opts.colors;

  } else if (opts.values) {
    classValues = parseValues(opts.values);

  } else if (classes > 1) {
    // no values were given: assign indexes for each class
    classValues = getIndexValues(classes);
    nullValue = -1;
  }

  if (looksLikeColors) {
    nullValue = nullValue || '#eee';
  }

  if (!classValues || classValues.length > 1 === false) {
    stop('Missing a valid number of classes');
  }

  if (classes > 1 && classValues.length != classes) {
    // TODO: check for non-interpolatable value types (e.g. boolean, text)
    classValues = interpolateValuesToClasses(classValues, classes);
  }

  if (opts.invert) {
    classValues = classValues.concat().reverse();
  }

  if (looksLikeColors) {
    message('Colors:', formatValuesForLogging(classValues));
  }

  if (opts.categories) {
    // categorical color scheme
    classify = getCategoricalClassifier(opts.categories);
  } else {
    // sequential color scheme
    classify = getNumericalClassifier(dataValues, classValues, opts);
  }

  if (opts.continuous && !opts.categories) {
    classToValue = getInterpolatedValueGetter(classValues, nullValue);
  } else {
    classToValue = getDiscreteValueGetter(classValues, nullValue, opts.other);
  }

  if (looksLikeColors && lyr.geometry_type == 'polyline') {
    outputField = 'stroke';
  } else if (looksLikeColors) {
    outputField = 'fill';
  } else {
    outputField = 'class';
  }
  if (opts.save_as) {
    outputField = opts.save_as;
  } else {
    message(`Output was saved to "${outputField}" field (use save-as= to change)`);
    // message('Use save-as=<field> to save to a different field');
  }
  dataValues.forEach(function(val, i) {
    var r = records[i] || {};
    var t = classify(val);
    r[outputField] = classToValue(t);
  });

};

function getNumericalClassifier(dataValues, classValues, opts) {
  // continuously interpolated colors/values use one fewer breakpoint than
  // discreetly classed values
  var numBreaks = opts.continuous ? classValues.length - 2 : classValues.length - 1;
  var round = opts.precision ? getRoundingFunction(opts.precision) : null;
  var breaks;

  if (round) {
    dataValues = dataValues.map(round);
  }

  if (numBreaks === 0) {
    breaks = [];
  } else if (opts.breaks) {
    // user-defined breaks
    breaks = opts.breaks;
  } else if (opts.equal_interval) {
    breaks = getEqualIntervalBreaks(dataValues, numBreaks);
  } else if (opts.quantile) {
    breaks = getQuantileBreaks(dataValues, numBreaks);
  } else if (opts.hybrid) {
    breaks = getHybridBreaks(dataValues, numBreaks);
  } else if (opts.nice) {
    breaks = getNiceBreaks(dataValues, numBreaks);
  } else {
    stop('Missing a classification type');
  }

  var dataRange = getDataRange(dataValues);
  printDistributionInfo(dataValues, dataRange, breaks);

  return opts.continuous ?
    getContinuousClassifier(breaks, dataRange) :
    getSequentialClassifier(breaks, round);
}

// arr: an array of strings
function parseValues(strings) {
  var values = strings;
  if (strings.every(utils.parseNumber)) {
    values = strings.map(function(str) {
      return +str;
    });
  }
  return values;
}

function formatValuesForLogging(arr) {
  if (arr.some(val => utils.isString(val) && val.indexOf('rgb(') === 0)) {
    return formatColorsAsHex(arr);
  }
  return arr;
}

function formatColorsAsHex(colors) {
  var d3 = require('d3-color');
  return colors.map(function(col) { return d3.color(col).formatHex(); });
}

function printDistributionInfo(values, range, breaks) {
  var dist = getDistributionData(breaks, values);
  message('Computed breaks:', breaks);
  message('Distribution:', dist.join(','));
  message('Data range:', range);
  if (dist.nulls) {
    message('Null values:', dist.nulls);
  }
}

function getIndexValues(n) {
  var vals = [];
  for (var i=0; i<n; i++) {
    vals.push(i);
  }
  return vals;
}
